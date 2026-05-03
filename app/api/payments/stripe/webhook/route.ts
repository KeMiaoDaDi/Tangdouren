// POST /api/payments/stripe/webhook
// Stripe 支付结果回调处理器
//
// 安全要求：
//   - 必须验证 Stripe 签名（stripe.webhooks.constructEvent）
//   - 幂等：通过 processed_webhook_events 表去重
//   - 邮件发送失败不回滚支付状态
//   - 不在日志中打印敏感信息

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/payment/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCancelToken, buildCancelUrl } from '@/lib/token/cancelToken'
import { sendEmail } from '@/lib/email/sender'
import { notifyAdminNewBooking } from '@/lib/email/notifyAdmin'
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation'

// Next.js App Router：Webhook 必须读取原始 body，不能用 request.json()
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  // 1. 验证 Stripe 签名
  let event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature'
    console.error('[webhook] 签名验证失败:', msg)
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 2. 幂等去重：已处理过的事件直接返回 200
  const { data: already } = await supabase
    .from('processed_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (already) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // 3. 根据事件类型处理
  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
    } else if (event.type === 'checkout.session.expired') {
      await handleCheckoutExpired(supabase, event.data.object as Stripe.Checkout.Session)
    } else if (
      event.type === 'charge.refund.updated' ||
      event.type === 'refund.updated'
    ) {
      await handleRefundUpdated(supabase, event.data.object as Stripe.Refund)
    }
    // 其他事件暂时忽略，返回 200 让 Stripe 不重试

    // 4. 标记已处理（放在最后，确保业务逻辑成功后再去重）
    await supabase.from('processed_webhook_events').insert({
      stripe_event_id: event.id,
    })

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[webhook] 处理事件 ${event.type} (${event.id}) 失败:`, detail)
    // 返回 500 让 Stripe 重试（幂等保护会防止重复处理）
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── 支付成功 ──────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
) {
  const bookingId       = session.metadata?.booking_id
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null
  const sessionId       = session.id

  if (!bookingId) {
    console.error('[webhook] checkout.session.completed: 缺少 booking_id metadata')
    return
  }

  // 读取预约信息
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('booking_id, status, customer_name, email, booking_date, start_time, end_time, assigned_table_code, assigned_table_type, deposit_amount, party_size')
    .eq('booking_id', bookingId)
    .single()

  if (error || !booking) {
    console.error('[webhook] 找不到 booking:', bookingId)
    return
  }

  // 幂等：已经 confirmed 就跳过（防止重复处理）
  if (booking.status === 'confirmed') return

  if (booking.status !== 'payment_pending') {
    console.error(`[webhook] booking ${bookingId} 状态异常: ${booking.status}`)
    return
  }

  // 生成取消 token
  const { token, hash, expiresAt } = generateCancelToken()
  const cancelUrl = buildCancelUrl(token)

  // 更新预约状态为 confirmed
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status:                  'confirmed',
      payment_intent_id:       paymentIntentId,
      checkout_session_id:     sessionId,
      cancel_token_hash:       hash,
      cancel_token_expires_at: expiresAt.toISOString(),
    })
    .eq('booking_id', bookingId)
    .eq('status', 'payment_pending') // 乐观锁：只在 pending 时才更新

  if (updateErr) {
    console.error('[webhook] 更新状态失败:', updateErr.message)
    throw updateErr
  }

  // 记录审计事件
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    event_type: 'payment_confirmed',
    metadata: { payment_intent_id: paymentIntentId, session_id: sessionId },
  })

  // 发送确认邮件（失败不影响主流程）
  const tableType = booking.assigned_table_type as string
  const tableDisplay = `${tableType === 'single' ? '单人桌' : tableType === 'double' ? '双人桌' : '四人桌'} · ${booking.assigned_table_code}`

  const { subject, html } = buildConfirmationEmail({
    customerName:  booking.customer_name,
    bookingDate:   booking.booking_date,
    startTime:     booking.start_time,
    endTime:       booking.end_time,
    tableDisplay,
    partySize:     booking.party_size,
    depositAmount: booking.deposit_amount ?? 500,
    cancelUrl,
    studioName:    process.env.NEXT_PUBLIC_STUDIO_NAME ?? '糖豆人手工工作室',
    studioAddress: 'Unit 226, 65-75 Whitechapel Road, London E1 1DU',
    studioEmail:   process.env.NEXT_PUBLIC_STUDIO_EMAIL ?? 'hello@tangdouren.co.uk',
  })

  const emailResult = await sendEmail({ to: booking.email, subject, html })

  // 通知管理员
  void notifyAdminNewBooking({
    bookingId,
    customerName: booking.customer_name,
    email:        booking.email,
    bookingDate:  booking.booking_date,
    startTime:    booking.start_time,
    endTime:      booking.end_time,
    tableCode:    booking.assigned_table_code,
    tableType:    booking.assigned_table_type,
    partySize:    booking.party_size,
    remark:       booking.remark,
    source:       'Stripe支付完成',
  })

  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    event_type: emailResult.ok ? 'confirmation_email_sent' : 'email_failed',
    metadata: emailResult.ok
      ? { message_id: emailResult.messageId }
      : { error: emailResult.error },
  })

  if (!emailResult.ok) {
    console.error(`[webhook] 确认邮件发送失败 (booking: ${bookingId}):`, emailResult.error)
  }
}

// ── 支付超时（Stripe Session 过期） ───────────────────────────────────────────

async function handleCheckoutExpired(
  supabase: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
) {
  const bookingId = session.metadata?.booking_id
  if (!bookingId) return

  await supabase
    .from('bookings')
    .update({ status: 'expired' })
    .eq('booking_id', bookingId)
    .eq('status', 'payment_pending')

  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    event_type: 'booking_expired',
    metadata: { session_id: session.id },
  })
}

// ── 退款状态更新 ──────────────────────────────────────────────────────────────

async function handleRefundUpdated(
  supabase: ReturnType<typeof createAdminClient>,
  refund: Stripe.Refund,
) {
  const refundId       = refund.id
  const refundStatus   = refund.status
  const refundAmount   = refund.amount
  const paymentIntent  = typeof refund.payment_intent === 'string' ? refund.payment_intent : null

  if (!paymentIntent) return

  const { data: booking } = await supabase
    .from('bookings')
    .select('booking_id, deposit_amount')
    .eq('payment_intent_id', paymentIntent)
    .maybeSingle()

  if (!booking) return

  if (refundStatus === 'succeeded') {
    const isPartial = refundAmount < (booking.deposit_amount ?? 0)
    await supabase
      .from('bookings')
      .update({
        status:      isPartial ? 'partially_refunded' : 'refunded',
        refund_id:   refundId,
        refund_amount: refundAmount,
        refunded_at: new Date().toISOString(),
      })
      .eq('booking_id', booking.booking_id)

    await supabase.from('booking_events').insert({
      booking_id: booking.booking_id,
      event_type: 'refund_succeeded',
      metadata: { refund_id: refundId, amount: refundAmount },
    })
  } else if (refundStatus === 'failed') {
    await supabase.from('booking_events').insert({
      booking_id: booking.booking_id,
      event_type: 'refund_failed',
      metadata: { refund_id: refundId },
    })
  }
}
