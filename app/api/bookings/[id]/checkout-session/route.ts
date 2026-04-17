// POST /api/bookings/:id/checkout-session
// 为一个 payment_pending 的预约创建 Stripe Checkout Session
// 返回 { checkoutUrl } 供前端跳转

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/payment/stripe'
import { formatGBP } from '@/lib/payment/depositConfig'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params

  if (!bookingId) {
    return NextResponse.json({ error: '缺少预约 ID' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // 1. 读取预约信息
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('booking_id, status, deposit_amount, currency, customer_name, email, booking_date, start_time, end_time, assigned_table_code, assigned_table_type, checkout_session_id')
      .eq('booking_id', bookingId)
      .single()

    if (error || !booking) {
      return NextResponse.json({ error: '预约不存在' }, { status: 404 })
    }

    // 2. 状态校验：只有 payment_pending 才允许创建 session
    if (booking.status !== 'payment_pending') {
      return NextResponse.json(
        { error: `预约状态为 ${booking.status}，无法发起支付` },
        { status: 409 },
      )
    }

    // 3. 幂等：如果已有 checkout_session_id，直接复用（用户可能刷新页面）
    if (booking.checkout_session_id) {
      const stripe = getStripe()
      try {
        const existing = await stripe.checkout.sessions.retrieve(booking.checkout_session_id)
        if (existing.status === 'open') {
          return NextResponse.json({ checkoutUrl: existing.url })
        }
      } catch {
        // session 已过期或无效，继续创建新的
      }
    }

    // 4. 创建 Stripe Checkout Session
    const stripe = getStripe()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const depositAmount = booking.deposit_amount ?? 500
    const currency      = booking.currency ?? 'gbp'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: depositAmount,
            product_data: {
              name: `糖豆人手工工作室 — 预约定金`,
              description: `${booking.booking_date} ${booking.start_time}–${booking.end_time} · ${booking.assigned_table_type === 'single' ? '单人桌' : booking.assigned_table_type === 'double' ? '双人桌' : '四人桌'} ${booking.assigned_table_code}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: bookingId,
      },
      customer_email: booking.email,
      success_url: `${appUrl}/booking/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/booking/pay/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 分钟后过期
    })

    // 5. 回写 checkout_session_id
    await supabase
      .from('bookings')
      .update({ checkout_session_id: session.id })
      .eq('booking_id', bookingId)

    // 6. 记录审计事件
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'checkout_created',
      metadata: {
        checkout_session_id: session.id,
        deposit_amount: depositAmount,
        currency,
      },
    })

    return NextResponse.json({ checkoutUrl: session.url })

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/bookings/:id/checkout-session]', detail)
    return NextResponse.json({ error: '创建支付会话失败，请重试' }, { status: 500 })
  }
}
