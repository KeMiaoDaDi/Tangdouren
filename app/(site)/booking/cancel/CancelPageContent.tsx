'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { formatGBP } from '@/lib/payment/depositConfig'
import { CANCEL_POLICY } from '@/lib/payment/cancelPolicy'

type Phase = 'preview' | 'confirming' | 'done' | 'error'

interface PreviewData {
  customerName:  string
  bookingDate:   string
  startTime:     string
  depositAmount: number
  refundAmount:  number
  policyText:    string
  noRefund:      boolean
}

export default function CancelPageContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [phase,    setPhase]    = useState<Phase>('preview')
  const [preview,  setPreview]  = useState<PreviewData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [result,   setResult]   = useState<{ refundAmount: number; policyText: string } | null>(null)

  // 加载取消预览（服务端计算退款金额）
  useEffect(() => {
    if (!token) { setErrorMsg('取消链接无效'); setLoading(false); return }

    fetch('/api/bookings/cancel/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorMsg(data.error); return }
        setPreview(data)
      })
      .catch(() => setErrorMsg('加载失败，请重试'))
      .finally(() => setLoading(false))
  }, [token])

  const handleConfirmCancel = async () => {
    setPhase('confirming')
    try {
      const res  = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? '取消失败'); setPhase('error'); return }
      setResult({ refundAmount: data.refundAmount, policyText: data.policyText })
      setPhase('done')
    } catch {
      setErrorMsg('网络错误，请重试')
      setPhase('error')
    }
  }

  if (loading) {
    return (
      <div className="card w-full max-w-md p-10 text-center">
        <p className="text-charcoal-light animate-pulse text-sm">正在验证取消链接…</p>
      </div>
    )
  }

  if (errorMsg && phase !== 'confirming') {
    return (
      <div className="card w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <XCircle size={28} className="text-red-400" />
        </div>
        <h1 className="font-display text-xl font-bold text-charcoal mb-3">无法取消</h1>
        <p className="text-charcoal-light text-sm mb-6">{errorMsg}</p>
        <Link href="/" className="btn-secondary w-full justify-center">返回首页</Link>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="card w-full max-w-md p-10 text-center animate-fade-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
          <CheckCircle2 size={36} className="text-sage" />
        </div>
        <h1 className="font-display text-2xl font-bold text-charcoal mb-2">预约已取消</h1>
        <p className="text-charcoal-light text-sm mb-4">{result.policyText}</p>
        {result.refundAmount > 0 && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 mb-4">
            退款 <strong>{formatGBP(result.refundAmount)}</strong> 已发起，通常 5–10 个工作日到账。
          </div>
        )}
        <p className="text-xs text-charcoal-light/60 mb-6">取消确认邮件已发送至您的邮箱。</p>
        <Link href="/" className="btn-secondary w-full justify-center">返回首页</Link>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div className="card w-full max-w-md p-8 animate-fade-in">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <AlertTriangle size={28} className="text-amber-500" />
      </div>
      <h1 className="font-display text-xl font-bold text-charcoal text-center mb-1">确认取消预约？</h1>
      <p className="text-charcoal-light text-sm text-center mb-6">此操作无法撤销。</p>

      {/* 预约详情 */}
      <div className="rounded-xl bg-warm-50 border border-sand-200 p-4 text-sm space-y-1.5 mb-5">
        <p className="font-semibold text-charcoal mb-1">预约信息</p>
        <p className="text-charcoal-light">👤 {preview.customerName}</p>
        <p className="text-charcoal-light">📅 {preview.bookingDate}</p>
        <p className="text-charcoal-light">⏰ {preview.startTime}</p>
        <p className="text-charcoal-light">💳 已付定金 {formatGBP(preview.depositAmount)}</p>
      </div>

      {/* 退款说明 */}
      <div className={`rounded-xl border px-4 py-3 text-sm mb-6 ${
        preview.noRefund
          ? 'bg-amber-50 border-amber-200 text-amber-700'
          : 'bg-green-50 border-green-200 text-green-700'
      }`}>
        {preview.noRefund ? (
          <>
            <Clock size={14} className="inline mr-1.5 mb-0.5" />
            {preview.policyText}
          </>
        ) : (
          <>
            <CheckCircle2 size={14} className="inline mr-1.5 mb-0.5" />
            {preview.policyText}（{formatGBP(preview.refundAmount)}）
          </>
        )}
      </div>

      <p className="text-xs text-charcoal-light/60 text-center mb-5">
        取消政策：提前 {CANCEL_POLICY.fullRefundHoursBeforeStart} 小时以上可全额退款
      </p>

      <div className="flex flex-col gap-3">
        <button
          onClick={handleConfirmCancel}
          disabled={phase === 'confirming'}
          className="w-full rounded-xl bg-red-500 hover:bg-red-600 text-white py-3 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {phase === 'confirming' ? '处理中…' : '确认取消预约'}
        </button>
        <Link href="/" className="btn-secondary w-full justify-center text-sm">
          不了，我不取消
        </Link>
      </div>
    </div>
  )
}
