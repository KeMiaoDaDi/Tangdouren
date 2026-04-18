// POST /api/admin/bookings/[id]/cancel
// 管理员取消预约 + 自动全额退款（如有定金）
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/payment/stripe'
import { sendEmail } from '@/lib/email/sender'
import { buildCancellationEmail } from '@/lib/email/templates/cancellation'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 管理员鉴权
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id } = await params
  const admin   = createAdminClient()

  // 获取预约详情
  const { data: booking, error: fetchErr } = await admin
    .from('bookings')
    .select('booking_id, status, customer_name, email, booking_date, start_time, deposit_amount, payment_intent_id')
    .eq('booking_id', id)
    .single()

  if (fetchErr || !booking) {
    return NextResponse.json({ error: '预约不存在' }, { status: 404 })
  }

  if (booking.status === 'cancelled' || booking.status === 'refunded') {
    return NextResponse.json({ error: '预约已取消，无需重复操作' }, { status: 409 })
  }

  const hasDeposit = (booking.deposit_amount ?? 0) > 0 && !!booking.payment_intent_id
  const newStatus  = hasDeposit ? 'refund_pending' : 'cancelled'

  // 更新状态（乐观锁：只对可取消状态操作）
  const { error: updateErr } = await admin
    .from('bookings')
    .update({
      status:        newStatus,
      cancelled_at:  new Date().toISOString(),
      cancel_reason: 'admin',
    })
    .eq('booking_id', id)
    .not('status', 'in', '("cancelled","refunded","refund_pending")')

  if (updateErr) {
    console.error('[admin/cancel] update error:', updateErr)
    return NextResponse.json({ error: '更新失败，请稍后重试' }, { status: 500 })
  }

  // 审计日志
  await admin.from('booking_events').insert({
    booking_id: booking.booking_id,
    event_type: 'admin_cancelled',
    metadata: { cancelled_by: user.email ?? user.id },
  })

  let refundId: string | null = null

  // 有定金 → 全额退款
  if (hasDeposit) {
    try {
      const stripe = getStripe()
      const refund = await stripe.refunds.create({
        payment_intent: booking.payment_intent_id!,
        amount:         booking.deposit_amount!,
      })
      refundId = refund.id

      await admin.from('bookings').update({
        status:      'cancelled',
        refund_id:   refund.id,
        refund_amount: booking.deposit_amount,
        refunded_at: new Date().toISOString(),
      }).eq('booking_id', id)

      await admin.from('booking_events').insert({
        booking_id: booking.booking_id,
        event_type: 'refund_initiated',
        metadata: { refund_id: refund.id, amount: booking.deposit_amount },
      })
    } catch (refundErr) {
      const msg = refundErr instanceof Error ? refundErr.message : String(refundErr)
      console.error('[admin/cancel] 退款失败:', msg)
      await admin.from('booking_events').insert({
        booking_id: booking.booking_id,
        event_type: 'refund_failed',
        metadata: { error: msg },
      })
      // 退款失败不阻断取消流程，状态保持 refund_pending，人工跟进
    }
  }

  // 发取消确认邮件（有邮箱才发）
  if (booking.email) {
    try {
      const { subject, html } = buildCancellationEmail({
        customerName:  booking.customer_name,
        bookingDate:   booking.booking_date,
        startTime:     booking.start_time,
        refundAmount:  hasDeposit ? (booking.deposit_amount ?? 0) : 0,
        depositAmount: booking.deposit_amount ?? 0,
        studioName:    process.env.NEXT_PUBLIC_STUDIO_NAME ?? '糖豆人手工工作室',
        studioEmail:   process.env.NEXT_PUBLIC_STUDIO_EMAIL ?? 'hello@tangdouren.co.uk',
      })
      await sendEmail({ to: booking.email, subject, html })
    } catch (emailErr) {
      console.error('[admin/cancel] 邮件发送失败:', emailErr)
    }
  }

  return NextResponse.json({
    success:    true,
    refunded:   hasDeposit,
    refundId,
    refundAmount: hasDeposit ? booking.deposit_amount : 0,
  })
}
