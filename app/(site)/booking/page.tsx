'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  AlertCircle, BookOpen, Clock, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AvailabilityResult } from '@/lib/booking/types'
import { BUSINESS_CONFIG } from '@/lib/booking/config'

// ── localStorage 待支付预约 ────────────────────────────────────────────────
const LS_KEY = 'tangdouren_pending_booking'

interface PendingBooking {
  bookingId:   string
  checkoutUrl: string
  displayText: string
  expiresAt:   number  // ms timestamp
}

function savePendingBooking(data: PendingBooking) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

function loadPendingBooking(): PendingBooking | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const data: PendingBooking = JSON.parse(raw)
    if (Date.now() > data.expiresAt) { localStorage.removeItem(LS_KEY); return null }
    return data
  } catch { return null }
}

function clearPendingBooking() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

// ── 伦敦时间工具 ──────────────────────────────────────────────────────────────
const TZ = 'Europe/London'
function todayLondon()   { return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date()) }
function getLondonYM()   {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return { year: parseInt(p.find(x => x.type === 'year')!.value), month: parseInt(p.find(x => x.type === 'month')!.value) - 1 }
}
function pad(n: number)  { return String(n).padStart(2, '0') }
function dateKey(y: number, m: number, d: number) { return `${y}-${pad(m+1)}-${pad(d)}` }
function getDays(y: number, m: number)   { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay() }

const WEEKDAYS = ['日','一','二','三','四','五','六']
const MONTHS   = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']

// ── 人数选项 ──────────────────────────────────────────────────────────────────
const PARTY_OPTIONS = [
  { value: 1, label: '1 人',   sub: '单人体验' },
  { value: 2, label: '2 人',   sub: '双人同乐' },
  { value: 3, label: '3-4 人', sub: '小组活动' },
]

// ── 步骤定义 ──────────────────────────────────────────────────────────────────
type Step = 'date' | 'party' | 'slots' | 'form' | 'done'
const STEPS: { key: Step; label: string }[] = [
  { key: 'date',  label: '选日期' },
  { key: 'party', label: '选人数' },
  { key: 'slots', label: '选时段' },
  { key: 'form',  label: '填信息' },
]

function stepIndex(s: Step) { return STEPS.findIndex(x => x.key === s) }

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function BookingPage() {
  const today                = useMemo(() => todayLondon(), [])
  const { year: iy, month: im } = useMemo(() => getLondonYM(), [])

  // 今天是否已过营业结束时间（伦敦时间 ≥ 21:00），若是则今日日历格灰色
  const isTodayClosed = useMemo(() => {
    const [closeH, closeM] = BUSINESS_CONFIG.closeTime.split(':').map(Number)
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const nowH = parseInt(parts.find(p => p.type === 'hour')!.value)
    const nowM = parseInt(parts.find(p => p.type === 'minute')!.value)
    return nowH * 60 + nowM >= closeH * 60 + closeM
  }, [])

  // 步骤状态
  const [step, setStep] = useState<Step>('date')

  // 日期选择
  const [year, setYear]           = useState(iy)
  const [month, setMonth]         = useState(im)
  const [selectedDate, setDate]   = useState<string | null>(null)
  const [blockedDates, setBlocked] = useState<string[]>([])
  const [loadingCal, setLoadingCal] = useState(false)

  // 人数 + 拼桌
  const [partySize, setPartySize]         = useState<number>(1)
  const [acceptsSharing, setSharing]      = useState(false)

  // 已选开始时间（Step 3 第一阶段）
  const [pickedTime, setPickedTime] = useState<string | null>(null)

  // 可用时段
  const [availability, setAvailability]   = useState<AvailabilityResult[]>([])
  const [loadingSlots, setLoadingSlots]   = useState(false)
  const [slotsError, setSlotsError]       = useState('')

  // 已选时段选项
  const [selectedOption, setSelectedOption] = useState<{
    startTime: string; durationMinutes: number; displayTag: string
  } | null>(null)

  // 表单
  const [form, setForm]         = useState({ name: '', email: '', remark: '' })
  const [formErrors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bookingResult, setBookingResult] = useState<{
    bookingId: string; assignedTableCode: string; endTime: string
  } | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  // ── 待支付横幅 ────────────────────────────────────────────────────────────
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null)
  useEffect(() => { setPendingBooking(loadPendingBooking()) }, [])

  // ── 日历数据加载 ──────────────────────────────────────────────────────────
  const fetchBlocked = useCallback(async (y: number, m: number) => {
    setLoadingCal(true)
    try {
      const res  = await fetch(`/api/blocked-dates?year=${y}&month=${m + 1}`)
      const data = await res.json()
      if (Array.isArray(data)) setBlocked(data.map((d: { date: string }) => d.date))
    } finally { setLoadingCal(false) }
  }, [])

  useEffect(() => { fetchBlocked(year, month) }, [year, month, fetchBlocked])

  // ── 可用时段加载 ──────────────────────────────────────────────────────────
  // 始终拉完整数据，筛选在前端完成（避免筛选后芯片消失无法切换）
  const fetchAvailability = useCallback(async () => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlotsError('')
    setPickedTime(null)
    setSelectedOption(null)
    try {
      const params = new URLSearchParams({
        date:           selectedDate,
        partySize:      String(partySize),
        acceptsSharing: String(acceptsSharing),
      })
      const res  = await fetch(`/api/availability?${params}`)
      const data = await res.json()
      setAvailability(data.results ?? [])
    } catch {
      setSlotsError('加载失败，请重试')
    } finally { setLoadingSlots(false) }
  }, [selectedDate, partySize, acceptsSharing])

  useEffect(() => {
    if (step === 'slots') fetchAvailability()
  }, [step, fetchAvailability])

  // ── 日历辅助 ──────────────────────────────────────────────────────────────
  const isCurrentMonth = year === iy && month === im
  function prevMonth() {
    if (isCurrentMonth) return
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }
  function isPast(day: number)    { return dateKey(year, month, day) < today }
  function isBlocked(day: number) { return blockedDates.includes(dateKey(year, month, day)) }
  function isClosedToday(day: number) {
    return isTodayClosed && dateKey(year, month, day) === today
  }

  // ── 时长格式化（60→1小时，90→1.5小时，…） ───────────────────────────────
  function fmtDuration(min: number) {
    return `${min / 60}小时`
  }

  // ── 所有出现的开始时间（从结果中提取） ───────────────────────────────────
  const allStartTimes = useMemo(() =>
    [...new Set(availability.map(r => r.startTime))].sort(),
  [availability])

  // ── 当前已选时间的时长选项 ────────────────────────────────────────────────
  const timeOptions = useMemo(() => {
    if (!pickedTime) return []
    return availability.find(r => r.startTime === pickedTime)?.options ?? []
  }, [availability, pickedTime])

  // ── 表单校验 ──────────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim())  e.name  = '请输入姓名'
    if (!form.email.trim()) {
      e.email = '请输入邮箱地址'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = '请输入有效的邮箱格式，如 example@mail.com'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── 提交预约 → 创建 payment_pending → 跳转 Stripe ────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !selectedOption || !selectedDate) return
    setSubmitting(true)
    setSubmitError('')
    try {
      // Step 1: 创建预约（payment_pending 状态）
      const bookingRes = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:            selectedDate,
          partySize,
          acceptsSharing,
          startTime:       selectedOption.startTime,
          durationMinutes: selectedOption.durationMinutes,
          customerName:    form.name,
          email:           form.email,
          remark:          form.remark || undefined,
        }),
      })
      const bookingData = await bookingRes.json()
      if (!bookingRes.ok) { setSubmitError(bookingData.error ?? '提交失败，请重试'); return }

      setBookingResult({
        bookingId:         bookingData.bookingId,
        assignedTableCode: bookingData.assignedTableCode,
        endTime:           bookingData.endTime,
      })

      // Step 2: 创建 Stripe Checkout Session
      const sessionRes = await fetch(`/api/bookings/${bookingData.bookingId}/checkout-session`, {
        method: 'POST',
      })
      const sessionData = await sessionRes.json()
      if (!sessionRes.ok) { setSubmitError(sessionData.error ?? '支付创建失败，请重试'); return }

      // Step 3: 保存到 localStorage，供用户返回时继续支付
      savePendingBooking({
        bookingId:   bookingData.bookingId,
        checkoutUrl: sessionData.checkoutUrl,
        displayText: `${selectedDate} ${selectedOption.startTime} · ${fmtDuration(selectedOption.durationMinutes)}`,
        expiresAt:   Date.now() + 30 * 60 * 1000,
      })

      // Step 4: 跳转到 Stripe Checkout（离开此页面）
      setRedirecting(true)
      window.location.href = sessionData.checkoutUrl

    } catch {
      setSubmitError('网络错误，请检查连接后重试')
    } finally { setSubmitting(false) }
  }

  function resetAll() {
    setStep('date'); setDate(null); setPartySize(1); setSharing(false)
    setPickedTime(null); setAvailability([])
    setSelectedOption(null)
    setForm({ name: '', email: '', remark: '' })
    setErrors({}); setSubmitError(''); setBookingResult(null)
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">

        {/* ── 待支付横幅 ─────────────────────────────────────────────────── */}
        {pendingBooking && (
          <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
            <Clock size={18} className="text-amber-500 shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-amber-800">你有一笔待支付的预约</span>
              <span className="text-amber-700 ml-1">（{pendingBooking.displayText}）</span>
            </div>
            <button
              onClick={() => { window.location.href = pendingBooking.checkoutUrl }}
              className="shrink-0 rounded-xl bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-600 transition-colors"
            >
              继续支付
            </button>
            <button
              onClick={() => { clearPendingBooking(); setPendingBooking(null) }}
              className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* 页面标题 */}
        <div className="text-center mb-10">
          <span className="text-terracotta text-sm font-medium tracking-wider uppercase">在线预约</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-charcoal mt-2">预约你的拼豆时光</h1>
          <p className="text-charcoal-light mt-2 text-sm">
            营业时间 {BUSINESS_CONFIG.openTime}–{BUSINESS_CONFIG.closeTime}（英国时间）
          </p>
        </div>

        {/* 进度条 */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-1.5 mb-10">
            {STEPS.map((s, i) => {
              const done    = stepIndex(step) > i
              const current = step === s.key
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    current ? 'bg-terracotta text-white shadow-warm' :
                    done    ? 'bg-sage text-white' :
                              'bg-sand-200 text-charcoal-light'
                  )}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={cn(
                    'text-xs hidden sm:inline',
                    current ? 'text-terracotta font-medium' :
                    done    ? 'text-sage-dark' : 'text-charcoal-light'
                  )}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px w-6 sm:w-10 transition-all', done ? 'bg-sage' : 'bg-sand-200')} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── STEP 1: 日期选择 ─────────────────────────────────────────────── */}
        {step === 'date' && (
          <div className="card p-6 sm:p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-xl font-semibold text-charcoal">选择预约日期</h2>
              <span className="text-xs text-charcoal-light bg-warm-100 px-2 py-1 rounded-full">🇬🇧 伦敦时间</span>
            </div>
            <p className="text-xs text-charcoal-light mb-6">
              今日：{today}
              {loadingCal && <span className="ml-2 animate-pulse text-terracotta">加载中…</span>}
            </p>

            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} disabled={isCurrentMonth}
                className={cn('btn-ghost p-2', isCurrentMonth && 'opacity-30 cursor-not-allowed')}>
                <ChevronLeft size={18} />
              </button>
              <span className="font-display font-semibold text-charcoal">{year} 年 {MONTHS[month]}</span>
              <button onClick={nextMonth} className="btn-ghost p-2"><ChevronRight size={18} /></button>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-charcoal-light py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: getFirstDay(year, month) }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: getDays(year, month) }).map((_, i) => {
                const day     = i + 1
                const key     = dateKey(year, month, day)
                const past        = isPast(day)
                const blocked     = isBlocked(day)
                const closedToday = isClosedToday(day)
                const sel         = selectedDate === key
                const isToday     = key === today
                const disabled    = past || blocked || closedToday
                const dimmed      = past || blocked || closedToday

                return (
                  <button key={day} disabled={disabled} onClick={() => setDate(key)}
                    className={cn(
                      'relative aspect-square rounded-xl text-sm font-medium transition-all duration-200',
                      sel    ? 'bg-terracotta text-white shadow-warm scale-105' :
                      dimmed ? 'text-charcoal-light/25 cursor-not-allowed' :
                               'bg-warm-100 text-charcoal hover:bg-sand-200 hover:scale-105'
                    )}
                  >
                    {day}
                    {isToday && !sel && !dimmed && (
                      <span className="absolute top-0.5 right-1 text-[8px] text-terracotta font-bold leading-none">今</span>
                    )}
                    {!sel && !dimmed && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-terracotta/50" />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-4 mt-5 text-xs text-charcoal-light">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warm-100 border border-sand-200" />可预约</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-terracotta" />已选</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warm-50 border border-sand-100 opacity-40" />不可选</span>
            </div>

            <div className="mt-6 flex justify-end">
              <button disabled={!selectedDate} onClick={() => setStep('party')} className="btn-primary">
                下一步：选择人数 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: 人数 + 拼桌 ──────────────────────────────────────────── */}
        {step === 'party' && (
          <div className="animate-fade-in">
            <button onClick={() => setStep('date')} className="btn-ghost mb-4 text-sm">
              <ChevronLeft size={14} /> 返回修改日期
            </button>
            <div className="card p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-charcoal mb-1">选择人数</h2>
              <p className="text-sm text-charcoal-light mb-6">{selectedDate}</p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {PARTY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setPartySize(opt.value); if (opt.value === 3) setSharing(false) }}
                    className={cn(
                      'rounded-2xl border-2 p-4 text-center transition-all duration-200',
                      partySize === opt.value
                        ? 'border-terracotta bg-terracotta/5 shadow-warm'
                        : 'border-sand-200 hover:border-terracotta/40 hover:bg-warm-50'
                    )}
                  >
                    <Users className={cn('mx-auto mb-1.5', partySize === opt.value ? 'text-terracotta' : 'text-charcoal-light')} size={22} />
                    <div className="font-semibold text-charcoal text-sm">{opt.label}</div>
                    <div className="text-xs text-charcoal-light mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>

              {/* 拼桌选项（3-4人时隐藏） */}
              {partySize !== 3 && (
                <div className={cn(
                  'rounded-2xl border-2 p-4 transition-all cursor-pointer',
                  acceptsSharing ? 'border-terracotta bg-terracotta/5' : 'border-sand-200 hover:border-terracotta/30'
                )}
                  onClick={() => setSharing(s => !s)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-charcoal text-sm">接受拼桌</div>
                      <div className="text-xs text-charcoal-light mt-0.5">
                        {partySize === 1
                          ? '允许升级到双人桌，可与另一位单人客户共享'
                          : '允许升级到四人桌，可与另一组双人客户共享'}
                      </div>
                    </div>
                    <div className={cn(
                      'h-5 w-9 rounded-full transition-colors relative shrink-0 ml-3',
                      acceptsSharing ? 'bg-terracotta' : 'bg-sand-200'
                    )}>
                      <div className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                        acceptsSharing ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </div>
                  </div>
                </div>
              )}

              {/* 作品参考按钮（不在主流程中） */}
              <button
                onClick={() => window.open('/gallery', '_blank')}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-sand-300 py-3 text-sm text-charcoal-light hover:border-terracotta/40 hover:text-terracotta transition-colors"
              >
                <BookOpen size={14} />
                查看作品大小与预计时长参考
              </button>

              <div className="mt-6 flex justify-end">
                <button onClick={() => setStep('slots')} className="btn-primary">
                  下一步：查看可约时段 <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: 可用时段（两阶段点选） ─────────────────────────────── */}
        {step === 'slots' && (
          <div className="animate-fade-in">
            <button onClick={() => setStep('party')} className="btn-ghost mb-4 text-sm">
              <ChevronLeft size={14} /> 返回修改人数
            </button>
            <div className="card p-6 sm:p-8">
              <div className="flex items-start justify-between mb-1">
                <h2 className="font-display text-xl font-semibold text-charcoal">选择时段</h2>
                <button onClick={fetchAvailability} className="text-xs text-charcoal-light hover:text-terracotta">刷新</button>
              </div>
              <p className="text-sm text-charcoal-light mb-6">
                {selectedDate} · {partySize === 3 ? '3-4人' : `${partySize}人`}
                {acceptsSharing && ' · 接受拼桌'}
              </p>

              {loadingSlots ? (
                <div className="py-10 text-center text-sm text-charcoal-light animate-pulse">加载可用时段中…</div>
              ) : slotsError ? (
                <div className="py-8 text-center text-sm text-red-500">{slotsError}</div>
              ) : allStartTimes.length === 0 ? (
                <div className="text-center py-10 text-charcoal-light">
                  <AlertCircle className="mx-auto mb-2 text-sand-300" size={32} />
                  <p className="text-sm">该日期暂无可约时段</p>
                  <p className="text-xs mt-1 text-charcoal-light/60">请尝试换个日期，或开启拼桌选项</p>
                </div>
              ) : (
                <>
                  {/* ── 第一阶段：选开始时间 ── */}
                  <div className="mb-2">
                    <p className="text-xs font-medium text-charcoal-light mb-3 tracking-wide">① 选择开始时间</p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {allStartTimes.map(t => {
                        const hasSharing = availability.find(r => r.startTime === t)?.options.some(o => o.isSharedOption)
                        return (
                          <button
                            key={t}
                            onClick={() => { setPickedTime(t); setSelectedOption(null) }}
                            className={cn(
                              'relative rounded-xl border-2 py-2.5 text-sm font-semibold text-center transition-all duration-200',
                              pickedTime === t
                                ? 'border-terracotta bg-terracotta text-white shadow-warm'
                                : 'border-sand-200 bg-warm-50 text-charcoal hover:border-terracotta/50 hover:bg-terracotta/5'
                            )}
                          >
                            {t}
                            {hasSharing && pickedTime !== t && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-sage border border-white" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {acceptsSharing && allStartTimes.some(t =>
                      availability.find(r => r.startTime === t)?.options.some(o => o.isSharedOption)
                    ) && (
                      <p className="mt-2 text-[11px] text-charcoal-light/60 flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sage" />
                        绿点表示该时段有拼桌选项
                      </p>
                    )}
                  </div>

                  {/* ── 第二阶段：选时长（选完时间才展开） ── */}
                  {pickedTime && (
                    <div className="mt-5 pt-5 border-t border-sand-100">
                      <p className="text-xs font-medium text-charcoal-light mb-3 tracking-wide">
                        ② {pickedTime} 开始，选择时长
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {timeOptions.map(opt => {
                          const key = `${pickedTime}_${opt.durationMinutes}_${opt.isSharedOption}`
                          const sel = selectedOption?.startTime === pickedTime
                            && selectedOption.durationMinutes === opt.durationMinutes
                            && selectedOption.displayTag === opt.displayTag
                          return (
                            <button
                              key={key}
                              onClick={() => setSelectedOption(sel ? null : {
                                startTime: pickedTime,
                                durationMinutes: opt.durationMinutes,
                                displayTag: opt.displayTag,
                              })}
                              className={cn(
                                'rounded-2xl border-2 p-3 text-center transition-all duration-200',
                                sel
                                  ? 'border-terracotta bg-terracotta/5 shadow-warm scale-[1.02]'
                                  : opt.isSharedOption
                                    ? 'border-sage/50 bg-sage/5 hover:border-sage hover:bg-sage/10'
                                    : 'border-sand-200 bg-warm-50 hover:border-terracotta/40 hover:bg-terracotta/5'
                              )}
                            >
                              <div className={cn(
                                'text-base font-bold leading-tight',
                                sel ? 'text-terracotta' : 'text-charcoal'
                              )}>
                                {fmtDuration(opt.durationMinutes)}
                              </div>
                              <div className={cn(
                                'text-[11px] mt-1 leading-snug',
                                sel ? 'text-terracotta/70'
                                    : opt.isSharedOption ? 'text-sage-dark'
                                    : 'text-charcoal-light'
                              )}>
                                {opt.displayTag}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 已选摘要 */}
              {selectedOption && (
                <div className="mt-5 rounded-2xl bg-terracotta/5 border border-terracotta/20 px-4 py-3 text-sm flex items-center gap-2">
                  <Clock size={14} className="text-terracotta shrink-0" />
                  <span className="text-charcoal">
                    已选：<strong>{selectedOption.startTime}</strong> 开始，
                    {fmtDuration(selectedOption.durationMinutes)}，
                    <span className="text-terracotta">{selectedOption.displayTag}</span>
                  </span>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button disabled={!selectedOption} onClick={() => setStep('form')} className="btn-primary">
                  下一步：填写信息 <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: 填写信息 ─────────────────────────────────────────────── */}
        {step === 'form' && selectedOption && (
          <div className="animate-fade-in">
            <button onClick={() => setStep('slots')} className="btn-ghost mb-4 text-sm">
              <ChevronLeft size={14} /> 返回修改时段
            </button>
            <div className="card p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-charcoal mb-1">填写预约信息</h2>
              <p className="text-sm text-charcoal-light mb-6">
                {selectedDate} · {selectedOption.startTime} · {fmtDuration(selectedOption.durationMinutes)} · {selectedOption.displayTag}
              </p>

              <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-5">
                  <div>
                    <label className="label" htmlFor="name">姓名 *</label>
                    <input id="name"
                      className={cn('input-field', formErrors.name && 'border-red-400 focus:ring-red-200')}
                      placeholder="请填写您预定的姓名"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                    {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="email">邮箱 *</label>
                    <input id="email" type="email"
                      className={cn('input-field', formErrors.email && 'border-red-400 focus:ring-red-200')}
                      placeholder="请输入邮箱地址，如 example@mail.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                    {formErrors.email && <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="remark">备注（可选）</label>
                    <textarea id="remark" rows={3}
                      className="input-field resize-none"
                      placeholder="如：有小朋友一起来、希望座位靠窗…"
                      value={form.remark}
                      onChange={e => setForm({ ...form, remark: e.target.value })}
                    />
                  </div>
                </div>

                {/* 预约摘要 */}
                <div className="mt-6 rounded-2xl bg-warm-50 border border-sand-200 p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-charcoal mb-2">预约摘要</p>
                  <p className="text-charcoal-light">📅 日期：{selectedDate}</p>
                  <p className="text-charcoal-light">⏰ 开始：{selectedOption.startTime}，时长 {fmtDuration(selectedOption.durationMinutes)}</p>
                  <p className="text-charcoal-light">🪑 桌型：{selectedOption.displayTag}</p>
                  <p className="text-charcoal-light">👥 人数：{partySize === 3 ? '3-4' : partySize} 人{acceptsSharing ? '（接受拼桌）' : ''}</p>
                </div>

                {/* 定金说明 */}
                <div className="mt-5 rounded-xl bg-terracotta/5 border border-terracotta/20 px-4 py-3 text-sm text-charcoal-light">
                  💳 提交后将跳转至支付页面，收取定金
                  <strong className="text-terracotta"> £{partySize === 3 ? '15' : partySize === 2 ? '10' : '5'}</strong>
                  （到店结清余款）
                </div>

                {submitError && (
                  <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                    {submitError}
                  </div>
                )}

                <button type="submit" disabled={submitting || redirecting} className="btn-primary w-full mt-4 py-3.5 text-base">
                  {redirecting ? '正在跳转支付…' : submitting ? '处理中…' : '下一步：支付定金'}
                  {!submitting && !redirecting && <CheckCircle2 size={18} />}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── STEP 5: 成功 ─────────────────────────────────────────────────── */}
        {step === 'done' && bookingResult && selectedOption && (
          <div className="card p-8 text-center animate-fade-in">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-sage/10">
              <CheckCircle2 size={40} className="text-sage" />
            </div>
            <h2 className="font-display text-2xl font-bold text-charcoal mb-2">预约成功！</h2>
            <p className="text-charcoal-light mb-2">您的预约已自动确认，名额已为您锁定。</p>
            <p className="text-sm text-charcoal-light/60 mb-8">如需变更或取消，请通过联系方式告知工作室。</p>

            <div className="rounded-2xl bg-warm-50 border border-sand-200 p-4 text-sm text-left space-y-2 mb-8">
              <p className="font-semibold text-charcoal mb-2">您的预约详情</p>
              <p className="text-xs text-charcoal-light/70">编号：{bookingResult.bookingId.slice(0, 8)}…</p>
              <p className="text-charcoal-light">📅 {selectedDate}</p>
              <p className="text-charcoal-light">⏰ {selectedOption.startTime} – {bookingResult.endTime}</p>
              <p className="text-charcoal-light">🪑 {selectedOption.displayTag} · {bookingResult.assignedTableCode}</p>
              <p className="text-charcoal-light">👤 {form.name} · {partySize === 3 ? '3-4' : partySize} 人</p>
              <p className="text-charcoal-light">✉️ {form.email}</p>
            </div>

            <button onClick={resetAll} className="btn-secondary">再次预约</button>
          </div>
        )}

      </div>
    </div>
  )
}
