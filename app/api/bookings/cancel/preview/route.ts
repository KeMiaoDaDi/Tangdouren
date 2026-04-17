// POST /api/bookings/cancel/preview
// 根据 token 返回退款预览（不执行取消）
// 供取消确认页展示退款金额

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/token/cancelToken'
import { calcRefund } from '@/lib/payment/cancelPolicy'

const Schema = z.object({ token: z.string().min(64).max(64) })

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '无效的取消链接' }, { status: 400 })
  }

  const { token } = parsed.data
  const tokenHash = hashToken(token)
  const supabase  = createAdminClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('booking_id, status, cancel_token_expires_at, customer_name, booking_date, start_time, deposit_amount')
    .eq('cancel_token_hash', tokenHash)
    .maybeSingle()

  if (error || !booking) {
    return NextResponse.json({ error: '取消链接无效或已过期' }, { status: 404 })
  }

  if (Date.now() > new Date(booking.cancel_token_expires_at).getTime()) {
    return NextResponse.json({ error: '取消链接已过期，请联系工作室' }, { status: 410 })
  }

  if (booking.status !== 'confirmed') {
    return NextResponse.json({ error: `预约状态为 ${booking.status}，无法取消` }, { status: 409 })
  }

  const bookingStart   = `${booking.booking_date} ${booking.start_time}`
  const refundDecision = calcRefund(booking.deposit_amount ?? 0, bookingStart)

  return NextResponse.json({
    customerName:  booking.customer_name,
    bookingDate:   booking.booking_date,
    startTime:     booking.start_time,
    depositAmount: booking.deposit_amount ?? 0,
    refundAmount:  refundDecision.refundAmount,
    policyText:    refundDecision.policyText,
    noRefund:      refundDecision.reason === 'no_refund',
  })
}
