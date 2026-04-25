'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  formatHMS,
  formatChineseDuration,
  getMilestones,
  calcBillingMinutes,
  calcBill,
  TIMER_PRICING,
} from '@/lib/timer/pricing'

interface TimerSession {
  session_id:       string
  customer_name:    string
  status:           'idle' | 'running' | 'paused' | 'completed'
  started_at:       string | null
  paused_at:        string | null
  total_paused_ms:  number
  stopped_at:       string | null
  elapsed_minutes:  number | null
  billing_minutes:  number | null
  amount_gbp:       number | null
  amount_cny:       number | null
  exchange_rate:    number | null
  bill_breakdown:   { label: string; amount: number }[] | null
}

function calcElapsedSeconds(session: TimerSession): number {
  if (session.status === 'idle') return 0
  if (session.status === 'completed' && session.elapsed_minutes !== null) {
    return session.elapsed_minutes * 60
  }
  if (!session.started_at) return 0
  const started    = new Date(session.started_at).getTime()
  const totalPaused = session.total_paused_ms ?? 0
  if (session.status === 'paused' && session.paused_at) {
    const pausedAt = new Date(session.paused_at).getTime()
    return Math.max(0, (pausedAt - started - totalPaused) / 1000)
  }
  return Math.max(0, (Date.now() - started - totalPaused) / 1000)
}

export default function TimerPage() {
  const { id }              = useParams<{ id: string }>()
  const [session, setSession] = useState<TimerSession | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const tickRef             = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSession = useCallback(async () => {
    try {
      const res  = await fetch(`/api/timers/${id}`, { cache: 'no-store' })
      if (!res.ok) { setError('计时订单不存在'); setLoading(false); return }
      const data = await res.json() as { session: TimerSession }
      setSession(data.session)
      setElapsed(calcElapsedSeconds(data.session))
      setLoading(false)
    } catch {
      setError('网络错误，请刷新页面')
      setLoading(false)
    }
  }, [id])

  // 初始加载 + 5s 轮询
  useEffect(() => {
    fetchSession()
    pollRef.current = setInterval(fetchSession, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchSession])

  // 本地秒表（running 状态下每秒 +1）
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (session?.status === 'running') {
      tickRef.current = setInterval(() => {
        setElapsed(calcElapsedSeconds(session))
      }, 1000)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-14 h-14 rounded-2xl object-cover mx-auto mb-4 animate-bounce shadow-sm" />
          <p className="text-stone-500">加载中…</p>
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-semibold text-stone-700 mb-2">找不到计时订单</h1>
          <p className="text-stone-400 text-sm">{error || '请确认链接是否正确'}</p>
        </div>
      </div>
    )
  }

  const isCompleted = session.status === 'completed'
  const isPaused    = session.status === 'paused'
  const isIdle      = session.status === 'idle'
  const milestones  = (isCompleted || isIdle) ? [] : getMilestones(elapsed)

  // 实时预估账单（顾客计时中参考用）
  const liveBillingMin = calcBillingMinutes(Math.floor(elapsed / 60))
  const liveBill       = calcBill(liveBillingMin)

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Header */}
        <div className="text-center mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="糖豆人手工工作室" className="w-14 h-14 rounded-2xl object-cover mx-auto shadow-sm" />
          <p className="text-xs text-stone-400 mt-1">糖豆人手工工作室</p>
        </div>

        {/* Status card */}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className={`px-6 py-4 text-center ${isCompleted ? 'bg-gradient-to-r from-green-500 to-emerald-600' : isPaused ? 'bg-gradient-to-r from-amber-400 to-orange-500' : isIdle ? 'bg-gradient-to-r from-stone-400 to-stone-500' : 'bg-gradient-to-r from-terracotta to-rose-600'}`}>
            <p className="text-white/80 text-xs mb-0.5">
              {session.customer_name} · {session.session_id}
            </p>
            <p className="text-white font-semibold text-sm">
              {isCompleted ? '拼豆已完成 🎉' : isPaused ? '⏸ 暂时休息中' : isIdle ? '⏳ 等待开始' : '拼豆进行中 ✨'}
            </p>
          </div>

          <div className="px-6 py-6 text-center">
            {isIdle ? (
              <div>
                <p className="text-stone-400 text-sm">店员将为您开始计时</p>
                <p className="text-stone-300 text-xs mt-1">请稍候…</p>
              </div>
            ) : isCompleted ? (
              /* 完成状态 */
              <div>
                <p className="text-stone-400 text-xs mb-1">总用时</p>
                <p className="text-4xl font-mono font-bold text-stone-800 tracking-wider">
                  {formatHMS(elapsed)}
                </p>
                <p className="text-stone-500 text-sm mt-1">
                  {formatChineseDuration(elapsed)}
                </p>
              </div>
            ) : (
              /* 计时中 / 暂停 */
              <div>
                <p className="text-stone-400 text-xs mb-1">已用时</p>
                <p className="text-5xl font-mono font-bold text-stone-800 tracking-wider tabular-nums">
                  {formatHMS(elapsed)}
                </p>
                {isPaused && (
                  <p className="text-amber-500 text-xs mt-2 font-medium">计时暂停中</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 里程碑提示（计时中） */}
        {!isCompleted && milestones.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm px-5 py-4 space-y-2.5">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">套餐倒计时</p>
            {milestones.map(m => (
              <div key={m.targetMinutes} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-700">{m.label}</p>
                  <p className="text-xs text-stone-400">£{m.packagePrice.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold text-terracotta">
                    -{formatHMS(m.remainingSeconds)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 账单（完成后显示确定账单，计时中显示预估） */}
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">
            {isCompleted ? '费用明细' : '预估费用（参考）'}
          </p>

          {(() => {
            const lines     = isCompleted ? (session.bill_breakdown ?? []) : liveBill.lines
            const totalGbp  = isCompleted ? (session.amount_gbp ?? 0)     : liveBill.totalGbp
            const amountCny = isCompleted ? session.amount_cny            : null
            const rate      = isCompleted ? session.exchange_rate         : null
            const billing   = isCompleted ? (session.billing_minutes ?? 0) : liveBillingMin

            return (
              <>
                {lines.map((l, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-stone-100 last:border-0">
                    <span className="text-sm text-stone-600">{l.label}</span>
                    <span className="text-sm font-medium text-stone-800">£{l.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2.5 mt-1">
                  <span className="text-sm font-semibold text-stone-700">
                    合计（计费 {Math.floor(billing / 60)}h{billing % 60 > 0 ? `${billing % 60}min` : ''}）
                  </span>
                  <span className="text-lg font-bold text-terracotta">£{totalGbp.toFixed(2)}</span>
                </div>
                {amountCny && rate && (
                  <p className="text-xs text-stone-400 text-right mt-0.5">
                    ≈ ¥{amountCny.toFixed(2)}（汇率 {rate.toFixed(4)}）
                  </p>
                )}
                {!isCompleted && (
                  <p className="text-xs text-stone-300 mt-2 text-center">
                    * 以实际结账时间为准
                  </p>
                )}
              </>
            )
          })()}
        </div>

        {/* 价格参考 */}
        {!isCompleted && (
          <div className="bg-white/60 rounded-2xl px-5 py-3">
            <p className="text-xs font-medium text-stone-400 mb-2">计费规则</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-500">
              <span>首小时</span><span className="text-right font-medium">£{TIMER_PRICING.firstHourGbp.toFixed(2)}</span>
              <span>续时（/h）</span><span className="text-right font-medium">£{TIMER_PRICING.continuationPerHourGbp.toFixed(2)}</span>
              <span>2.5小时套餐</span><span className="text-right font-medium text-terracotta">£{TIMER_PRICING.package250hGbp.toFixed(2)}</span>
              <span>4小时套餐</span><span className="text-right font-medium text-terracotta">£{TIMER_PRICING.package400hGbp.toFixed(2)}</span>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-stone-300 pb-4">
          每 5 秒自动更新 · {session.session_id}
        </p>
      </div>
    </div>
  )
}
