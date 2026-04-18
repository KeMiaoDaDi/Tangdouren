// POST /api/admin/bookings
// 管理员手动创建已确认预约（无需定金，直接 confirmed）
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { BUSINESS_CONFIG as cfg } from '@/lib/booking/config'
import { sendEmail } from '@/lib/email/sender'

const Schema = z.object({
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式错误'),
  startTime:    z.string().regex(/^\d{2}:\d{2}$/, '开始时间格式错误'),
  endTime:      z.string().regex(/^\d{2}:\d{2}$/, '结束时间格式错误'),
  tableCode:    z.string().min(1, '请选择桌位'),
  customerName: z.string().min(1, '请填写姓名').max(50),
  email:        z.string().email('邮箱格式不正确').max(100).optional().or(z.literal('')),
  partySize:    z.number().int().min(1).max(4).optional(),
  remark:       z.string().max(500).optional(),
})

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minToTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  // 管理员鉴权
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? '参数有误' }, { status: 400 })
  }

  const { date, startTime, endTime, tableCode, customerName, email, partySize, remark } = parsed.data

  // 时间合法性检查
  const startMin = timeToMin(startTime)
  const endMin   = timeToMin(endTime)
  if (endMin <= startMin) {
    return NextResponse.json({ error: '结束时间必须晚于开始时间' }, { status: 400 })
  }
  const openMin  = timeToMin(cfg.openTime)
  const closeMin = timeToMin(cfg.closeTime)
  if (startMin < openMin || endMin > closeMin) {
    return NextResponse.json({ error: `时间必须在营业时间内 (${cfg.openTime}–${cfg.closeTime})` }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // 查询桌位信息（获取 table_id 和 tableType）
    const { data: tableRow, error: tableErr } = await admin
      .from('tables')
      .select('table_id, table_type')
      .eq('table_code', tableCode)
      .single()

    if (tableErr || !tableRow) {
      return NextResponse.json({ error: `桌位 ${tableCode} 不存在` }, { status: 400 })
    }

    const bufferedEndTime = minToTime(endMin + cfg.cleanupBufferMinutes)

    // 冲突检测：同桌、同日、时间重叠的有效预约
    const { data: conflicts } = await admin
      .from('bookings')
      .select('booking_id, customer_name, start_time, buffered_end_time')
      .eq('assigned_table_code', tableCode)
      .eq('booking_date', date)
      .not('status', 'in', '("cancelled","payment_failed","expired")')
      .lt('start_time', bufferedEndTime)
      .gt('buffered_end_time', startTime)

    if (conflicts && conflicts.length > 0) {
      const c = conflicts[0]
      return NextResponse.json(
        { error: `${tableCode} 在 ${c.start_time}–${c.buffered_end_time} 已有预约（${c.customer_name}），时间冲突` },
        { status: 409 }
      )
    }

    // 推断桌型对应的人数
    const tableTypeCapacity: Record<string, number> = { single: 1, double: 2, four: 4 }
    const effectivePartySize = partySize ?? tableTypeCapacity[tableRow.table_type] ?? 1

    // 根据桌型推导 seat_group_type（整桌私人预约）
    const seatGroupTypeMap: Record<string, string> = {
      single: 'single_on_single',
      double: 'double_on_double',
      four:   'group_on_four',
    }
    const seatGroupType = seatGroupTypeMap[tableRow.table_type] ?? 'single_on_single'

    // 直接创建 confirmed 预约（管理员操作，无需定金）
    const { data: booking, error: insertErr } = await admin
      .from('bookings')
      .insert({
        booking_date:               date,
        customer_name:              customerName,
        email:                      email || '',
        party_size:                 effectivePartySize,
        accepts_sharing:            false,
        start_time:                 startTime,
        end_time:                   endTime,
        buffered_end_time:          bufferedEndTime,
        estimated_duration_minutes: endMin - startMin,
        assigned_table_id:          tableRow.table_id,
        assigned_table_code:        tableCode,
        assigned_table_type:        tableRow.table_type,
        booking_mode:               'private_full_table',
        seat_group_type:            seatGroupType,
        status:                     'confirmed',
        remark:                     remark ?? '管理员手动预约',
        deposit_amount:             0,
        currency:                   'gbp',
      })
      .select('booking_id')
      .single()

    if (insertErr) {
      console.error('[POST /api/admin/bookings] insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 审计日志（不阻塞主流程）
    void admin.from('booking_events').insert({
      booking_id: booking.booking_id,
      event_type: 'admin_manual_booking',
      metadata: { created_by: user.email ?? user.id, table: tableCode },
    })

    // 发送预约确认邮件（有邮箱时，不阻塞主流程）
    if (email) {
      const studioName    = process.env.NEXT_PUBLIC_STUDIO_NAME  ?? '糖豆人手工工作室'
      const studioEmail   = process.env.NEXT_PUBLIC_STUDIO_EMAIL ?? 'hello@tangdouren.co.uk'
      const studioAddress = process.env.NEXT_PUBLIC_STUDIO_ADDRESS ?? 'Algate East, London'
      const tableTypeNames: Record<string, string> = { single: '单人桌', double: '双人桌', four: '四人桌' }
      const tableDisplay  = `${tableTypeNames[tableRow.table_type] ?? tableRow.table_type} · ${tableCode}`

      const subject = `预约确认 — ${date} ${startTime} | ${studioName}`
      const html = `
<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#faf8f5;margin:0;padding:0;}
  .c{max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}
  .h{background:linear-gradient(135deg,#D97059,#C4573A);padding:28px 32px 20px;text-align:center;color:#fff;}
  .h h1{margin:0 0 4px;font-size:20px;}
  .h p{margin:0;font-size:13px;opacity:.85;}
  .b{padding:24px 32px;}
  .g{font-size:15px;color:#3d2f2a;margin-bottom:18px;}
  .box{background:#fdf6f0;border:1px solid #f0e0d0;border-radius:12px;padding:18px;margin-bottom:20px;}
  .row{display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f5ede5;}
  .row:last-child{border-bottom:none;}
  .lbl{color:#8a7060;}.val{color:#3d2f2a;font-weight:600;text-align:right;}
  .note{background:#fff8f0;border-left:3px solid #D97059;padding:12px 14px;border-radius:0 8px 8px 0;font-size:13px;color:#6b4c3b;line-height:1.6;margin-bottom:20px;}
  .ft{padding:16px 32px 24px;border-top:1px solid #f0e8e0;font-size:12px;color:#b09080;text-align:center;line-height:1.8;}
</style></head><body>
<div class="c">
  <div class="h"><h1>🎉 预约已确认！</h1><p>${studioName}</p></div>
  <div class="b">
    <p class="g">你好，${customerName}！<br/>你的拼豆体验名额已确认，期待与你相见 ✨</p>
    <div class="box">
      <div class="row"><span class="lbl">📅 日期</span><span class="val">${date}</span></div>
      <div class="row"><span class="lbl">⏰ 时间</span><span class="val">${startTime} – ${endTime}</span></div>
      <div class="row"><span class="lbl">🪑 桌位</span><span class="val">${tableDisplay}</span></div>
      <div class="row"><span class="lbl">👥 人数</span><span class="val">${effectivePartySize} 人</span></div>
      <div class="row"><span class="lbl">📍 地址</span><span class="val">${studioAddress}</span></div>
    </div>
    <div class="note">
      如需修改或取消预约，请提前联系我们：<br/>
      📧 <a href="mailto:${studioEmail}" style="color:#D97059;">${studioEmail}</a>
    </div>
  </div>
  <div class="ft">${studioName} · ${studioAddress}<br/>📧 ${studioEmail}</div>
</div>
</body></html>`.trim()

      void sendEmail({ to: email, subject, html })
    }

    return NextResponse.json({ bookingId: booking.booking_id, tableCode }, { status: 201 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/admin/bookings] unexpected error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
