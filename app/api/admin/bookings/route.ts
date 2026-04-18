// POST /api/admin/bookings
// 管理员手动创建已确认预约（无需定金，直接 confirmed）
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { BUSINESS_CONFIG as cfg } from '@/lib/booking/config'

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

  const admin = createAdminClient()

  // 查询桌位信息（获取 table_id 和 tableType）
  const { data: tableRow } = await admin
    .from('tables')
    .select('table_id, table_type')
    .eq('table_code', tableCode)
    .single()

  if (!tableRow) {
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
    .lt('start_time', bufferedEndTime)   // 现有预约开始 < 新预约缓冲结束
    .gt('buffered_end_time', startTime)  // 现有预约缓冲结束 > 新预约开始

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

  // 直接创建 confirmed 预约（管理员操作，无需定金）
  const { data: booking, error: insertErr } = await admin
    .from('bookings')
    .insert({
      booking_date:               date,
      customer_name:              customerName,
      email:                      email || null,
      party_size:                 effectivePartySize,
      accepts_sharing:            false,
      start_time:                 startTime,
      end_time:                   endTime,
      buffered_end_time:          bufferedEndTime,
      estimated_duration_minutes: endMin - startMin,
      assigned_table_id:          tableRow.table_id,
      assigned_table_code:        tableCode,
      assigned_table_type:        tableRow.table_type,
      booking_mode:               'private_table',
      seat_group_type:            'private_table',
      status:                     'confirmed',
      remark:                     remark ?? '管理员手动预约',
      deposit_amount:             0,
      currency:                   'gbp',
    })
    .select('booking_id')
    .single()

  if (insertErr) {
    console.error('[POST /api/admin/bookings]', insertErr)
    return NextResponse.json({ error: insertErr.message ?? '创建失败，请稍后重试' }, { status: 500 })
  }

  // 审计日志
  await admin.from('booking_events').insert({
    booking_id: booking.booking_id,
    event_type: 'admin_manual_booking',
    metadata: { created_by: user.email ?? user.id, table: tableCode },
  })

  return NextResponse.json({ bookingId: booking.booking_id, tableCode }, { status: 201 })
}
