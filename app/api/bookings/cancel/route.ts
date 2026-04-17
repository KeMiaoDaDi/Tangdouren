// POST /api/bookings/cancel
// 执行取消预约 + 服务端退款决策
//
// 安全要求：
//   - token 校验在服务端完成，前端不参与退款金额决定
//   - 幂等：已取消的预约不能重复取消
//   - token 使用一次后立即清空

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/token/cancelToken'
import { calcRefund } from '@/lib/payment/cancelPolicy'
import { getStripe } from '@/lib/payment/stripe'
import { sendEmail } from '@/lib/email/sender'
import { buildCancellationEmail } from '@/lib/email/templates/cancellation'

const CancelSchema = z.object({
  token: z.string().min(64).max(64),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const parsed = CancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '无效的取消链接' }, { status: 400 })
  }

  const { token } = parsed.data
  const tokenHash = hashToken(token)
  const supabase  = createAdminClient()

  try {
    // 1. 根据 hash 查找预约
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('booking_id, status, cancel_token_hash, cancel_token_expires_at, customer_name, email, booking_date, start_time, deposit_amount, payment_intent_id, refund_id')
      .eq('cancel_token_hash', tokenHash)
      .maybeSingle()

    if (error) throw error

    if (!booking) {
      return NextResponse.json({ error: '取消链接无效或已过期' }, { status: 404 })
    }

    // 2. 验证 token 是否过期
    const expiresAt = new Date(booking.cancel_token_expires_at)
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json({ error: '取消链接已过期，请联系工作室' }, { status: 410 })
    }

    // 3. 幂等：只有 confirmed 状态可以取消
    if (booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: `预约当前状态为 ${booking.status}，无法取消` },
        { status: 409 },
      )
    }

    // 4. 服务端计算退款金额（前端不参与）
    const bookingStart = `${booking.booking_date} ${booking.start_time}`
    const refundDecision = calcRefund(booking.deposit_amount ?? 0, bookingStart)

    // 5. 清空 cancel_token（一次性），记录取消时间
    await supabase
      .from('bookings')
      .update({
        cancel_token_hash:       null,
        cancel_token_expires_at: null,
        cancelled_at:            new Date().toISOString(),
        cancel_reason:           'customer',
        status:                  refundDecision.refundAmount > 0 ? 'refund_pending' : 'cancelled',
      })
      .eq('booking_id', booking.booking_id)
      .eq('status', 'confirmed')  // 乐观锁

    // 6. 记录审计事件
    await supabase.from('booking_events').insert({
      booking_id: booking.booking_id,
      event_type: 'cancellation_requested',
      metadata: {
        refund_amount: refundDecision.refundAmount,
        refund_reason: refundDecision.reason,
      },
    })

    // 7. 如需退款，调用 Stripe 服务端 API
    if (refundDecision.refundAmount > 0 && booking.payment_intent_id) {
      try {
        const stripe = getStripe()
        const refund = await stripe.refunds.create({
          payment_intent: booking.payment_intent_id,
          amount:         refundDecision.refundAmount,
        })

        await supabase.from('booking_events').insert({
          booking_id: booking.booking_id,
          event_type: 'refund_initiated',
          metadata: { refund_id: refund.id, amount: refundDecision.refundAmount },
        })
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr)
        console.error(`[cancel] 退款发起失败 (booking: ${booking.booking_id}):`, msg)

        await supabase.from('booking_events').insert({
          booking_id: booking.booking_id,
          event_type: 'refund_failed',
          metadata: { error: msg },
        })
        // 退款失败不影响取消流程，后台可手动处理
      }
    }

    // 8. 发取消确认邮件（失败不影响取消）
    const { subject, html } = buildCancellationEmail({
      customerName:  booking.customer_name,
      bookingDate:   booking.booking_date,
      startTime:     booking.start_time,
      refundAmount:  refundDecision.refundAmount,
      depositAmount: booking.deposit_amount ?? 0,
      studioName:    process.env.NEXT_PUBLIC_STUDIO_NAME ?? '糖豆人手工工作室',
      studioEmail:   process.env.NEXT_PUBLIC_STUDIO_EMAIL ?? 'hello@tangdouren.co.uk',
    })

    const emailResult = await sendEmail({ to: booking.email, subject, html })

    await supabase.from('booking_events').insert({
      booking_id: booking.booking_id,
      event_type: emailResult.ok ? 'cancellation_email_sent' : 'email_failed',
      metadata: emailResult.ok
        ? { message_id: emailResult.messageId }
        : { error: emailResult.error },
    })

    return NextResponse.json({
      success: true,
      refundAmount:  refundDecision.refundAmount,
      refundReason:  refundDecision.reason,
      policyText:    refundDecision.policyText,
    })

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/bookings/cancel]', detail)
    return NextResponse.json({ error: '取消失败，请稍后重试' }, { status: 500 })
  }
}
