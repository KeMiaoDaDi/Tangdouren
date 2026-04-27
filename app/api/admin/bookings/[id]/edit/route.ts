// PATCH /api/admin/bookings/[id]/edit
// 管理员修改预约信息（日期/时间/桌位/人数/备注），含冲突检测 + 可选邮件通知
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from '@/lib/booking/config'
import { sendEmail } from '@/lib/email/sender'
import { buildUpdateEmail } from '@/lib/email/templates/update'

const bodySchema = z.object({
  booking_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time:          z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform(v => v.slice(0, 5)).optional(),
  end_time:            z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform(v => v.slice(0, 5)).optional(),
  assigned_table_code: z.string().optional(),
  party_size:          z.number().int().min(1).max(4).optional(),
  remark:              z.string().max(500).nullable().optional(),
  send_email:          z.boolean().optional().default(false),
})

const TABLE_TYPE: Record<string, string> = {
  single: '单人桌', double: '双人桌', four: '四人桌',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 管理员鉴权
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id } = await params
  const admin  = createAdminClient()

  // 解析请求体
  const raw = await req.json()
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误', detail: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  // 获取原始预约
  const { data: booking, error: fetchErr } = await admin
    .from('bookings')
    .select('booking_id, status, customer_name, email, booking_date, start_time, end_time, assigned_table_code, assigned_table_type, party_size, remark')
    .eq('booking_id', id)
    .single()

  if (fetchErr || !booking) {
    return NextResponse.json({ error: '预约不存在' }, { status: 404 })
  }
  if (['cancelled', 'refunded', 'refund_pending', 'expired'].includes(booking.status)) {
    return NextResponse.json({ error: '该状态的预约不可编辑' }, { status: 409 })
  }

  // 合并新旧值
  const newDate      = body.booking_date        ?? booking.booking_date
  const newStart     = body.start_time          ?? booking.start_time
  const newEnd       = body.end_time            ?? booking.end_time
  const newTableCode = body.assigned_table_code ?? booking.assigned_table_code
  const newPartySize = body.party_size          ?? booking.party_size
  const newRemark    = body.remark !== undefined ? body.remark : booking.remark

  // 校验时间顺序
  if (newStart >= newEnd) {
    return NextResponse.json({ error: '结束时间必须晚于开始时间' }, { status: 400 })
  }

  // 查桌位信息
  const tableDef = TABLE_DEFINITIONS.find(t => t.tableCode === newTableCode)
  if (!tableDef) {
    return NextResponse.json({ error: '无效的桌号' }, { status: 400 })
  }

  // 冲突检测：新时段内该桌是否已被其他预约占用
  const { data: conflicts } = await admin
    .from('bookings')
    .select('booking_id')
    .eq('booking_date', newDate)
    .eq('assigned_table_code', newTableCode)
    .in('status', ['confirmed', 'completed', 'payment_pending'])
    .neq('booking_id', id) // 排除自身
    .lt('start_time', newEnd)
    .gt('end_time',   newStart)

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: '所选时段该桌位已有其他预约，请更换时间或桌号' }, { status: 409 })
  }

  // 计算变更字段（用于邮件展示）
  const changedFields: string[] = []
  if (body.booking_date        && body.booking_date        !== booking.booking_date)        changedFields.push('日期')
  if (body.start_time          && body.start_time          !== booking.start_time)          changedFields.push('开始时间')
  if (body.end_time            && body.end_time            !== booking.end_time)            changedFields.push('结束时间')
  if (body.assigned_table_code && body.assigned_table_code !== booking.assigned_table_code) changedFields.push('桌位')
  if (body.party_size          && body.party_size          !== booking.party_size)          changedFields.push('人数')
  if (body.remark !== undefined && body.remark             !== booking.remark)              changedFields.push('备注')

  // 执行更新
  const { error: updateErr } = await admin
    .from('bookings')
    .update({
      booking_date:        newDate,
      start_time:          newStart,
      end_time:            newEnd,
      assigned_table_code: newTableCode,
      assigned_table_type: tableDef.tableType,
      party_size:          newPartySize,
      remark:              newRemark,
    })
    .eq('booking_id', id)

  if (updateErr) {
    console.error('[admin/edit] update error:', updateErr)
    return NextResponse.json({ error: '更新失败：' + updateErr.message }, { status: 500 })
  }

  // 审计日志
  void admin.from('booking_events').insert({
    booking_id: id,
    event_type: 'admin_edited',
    metadata: {
      edited_by:     user.email ?? user.id,
      changed_fields: changedFields,
      before: {
        booking_date:        booking.booking_date,
        start_time:          booking.start_time,
        end_time:            booking.end_time,
        assigned_table_code: booking.assigned_table_code,
        party_size:          booking.party_size,
      },
      after: { booking_date: newDate, start_time: newStart, end_time: newEnd, assigned_table_code: newTableCode, party_size: newPartySize },
    },
  })

  // 发送邮件通知（有邮箱 + 勾选发送 + 有实际变更）
  if (body.send_email && booking.email && changedFields.length > 0) {
    try {
      const tableDisplay = `${TABLE_TYPE[tableDef.tableType] ?? tableDef.tableType} · ${newTableCode}`
      const { subject, html } = buildUpdateEmail({
        customerName:  booking.customer_name,
        bookingDate:   newDate,
        startTime:     newStart,
        endTime:       newEnd,
        tableDisplay,
        partySize:     newPartySize,
        studioName:    process.env.NEXT_PUBLIC_STUDIO_NAME  ?? '糖豆人手工工作室',
        studioEmail:   process.env.NEXT_PUBLIC_STUDIO_EMAIL ?? 'hello@tangdouren.co.uk',
        changedFields,
      })
      await sendEmail({ to: booking.email, subject, html })
    } catch (emailErr) {
      console.error('[admin/edit] 邮件发送失败:', emailErr)
    }
  }

  return NextResponse.json({ success: true, changedFields })
}
