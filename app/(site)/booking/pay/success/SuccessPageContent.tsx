'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

function clearPendingBooking() {
  try { localStorage.removeItem('tangdouren_pending_booking') } catch {}
}
import Link from 'next/link'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'

type Phase = 'polling' | 'confirmed' | 'timeout' | 'error'

const MAX_POLLS = 20
const POLL_INTERVAL = 3000

export default function SuccessPageContent() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('session_id')

  const [phase,     setPhase]     = useState<Phase>('polling')
  const [booking,   setBooking]   = useState<{
    bookingId: string; bookingDate: string; startTime: string; endTime: string; tableCode: string
  } | null>(null)
  const [pollCount, setPollCount] = useState(0)

  const findBookingBySession = useCallback(async () => {
    if (!sessionId) { setPhase('error'); return }
    try {
      const res  = await fetch(`/api/bookings/by-session?session_id=${sessionId}`)
      const data = await res.json()
      if (!res.ok || !data.booking_id) { setPhase('error'); return }
      return data
    } catch {
      return null
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) { setPhase('error'); return }

    let cancelled = false
    let count = 0

    const poll = async () => {
      const bookingData = await findBookingBySession()
      if (cancelled) return

      if (!bookingData) {
        count++
        setPollCount(count)
        if (count >= MAX_POLLS) { setPhase('timeout'); return }
        setTimeout(poll, POLL_INTERVAL)
        return
      }

      if (bookingData.status === 'confirmed') {
        clearPendingBooking()
        setBooking({
          bookingId:   bookingData.booking_id,
          bookingDate: bookingData.booking_date,
          startTime:   bookingData.start_time,
          endTime:     bookingData.end_time,
          tableCode:   bookingData.assigned_table_code,
        })
        setPhase('confirmed')
        return
      }

      if (bookingData.status === 'payment_pending') {
        count++
        setPollCount(count)
        if (count >= MAX_POLLS) { setPhase('timeout'); return }
        setTimeout(poll, POLL_INTERVAL)
        return
      }

      setPhase('error')
    }

    poll()
    return () => { cancelled = true }
  }, [sessionId, findBookingBySession])

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {phase === 'polling' && (
          <div className="card p-10 text-center">
            <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-terracotta/10 flex items-center justify-center animate-pulse">
              <Clock size={32} className="text-terracotta" />
            </div>
            <h1 className="font-display text-2xl font-bold text-charcoal mb-2">支付确认中…</h1>
            <p className="text-charcoal-light text-sm mb-4">正在等待支付确认，请稍候（{pollCount}/{MAX_POLLS}）</p>
            <p className="text-xs text-charcoal-light/60">请勿关闭此页面</p>
          </div>
        )}

        {phase === 'confirmed' && booking && (
          <div className="card p-10 text-center animate-fade-in">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-sage/10">
              <CheckCircle2 size={40} className="text-sage" />
            </div>
            <h1 className="font-display text-2xl font-bold text-charcoal mb-2">预约已确认！🎉</h1>
            <p className="text-charcoal-light text-sm mb-6">确认邮件已发送至您的邮箱，请查收。</p>
            <div className="rounded-2xl bg-warm-50 border border-sand-200 p-4 text-sm text-left space-y-2 mb-6">
              <p className="font-semibold text-charcoal mb-1">预约详情</p>
              <p className="text-charcoal-light">📅 {booking.bookingDate}</p>
              <p className="text-charcoal-light">⏰ {booking.startTime} – {booking.endTime}</p>
              <p className="text-charcoal-light">🪑 {booking.tableCode}</p>
            </div>
            <p className="text-xs text-charcoal-light/60 mb-6">如需取消，请查看确认邮件中的取消链接。</p>
            <Link href="/" className="btn-primary w-full justify-center">返回首页</Link>
          </div>
        )}

        {phase === 'timeout' && (
          <div className="card p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
              <Clock size={32} className="text-amber-500" />
            </div>
            <h1 className="font-display text-xl font-bold text-charcoal mb-2">确认需要一点时间</h1>
            <p className="text-charcoal-light text-sm mb-6">
              支付已收到，但系统确认需要稍长时间。<br />
              请留意您的邮箱，确认邮件将在几分钟内到达。
            </p>
            <Link href="/" className="btn-secondary w-full justify-center">返回首页</Link>
          </div>
        )}

        {phase === 'error' && (
          <div className="card p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h1 className="font-display text-xl font-bold text-charcoal mb-2">出现了问题</h1>
            <p className="text-charcoal-light text-sm mb-6">
              无法确认预约状态。如已扣款，请联系工作室。
            </p>
            <Link href="/" className="btn-secondary w-full justify-center">返回首页</Link>
          </div>
        )}

      </div>
    </div>
  )
}
