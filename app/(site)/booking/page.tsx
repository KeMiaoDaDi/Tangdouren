'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  AlertCircle, BookOpen, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AvailabilityResult, AvailabilityOption } from '@/lib/booking/types'
import { BUSINESS_CONFIG } from '@/lib/booking/config'

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

  // 可选筛选
  const [filterTime, setFilterTime]         = useState<string | null>(null)
  const [filterDuration, setFilterDuration] = useState<number | null>(null)

  // 可用时段
  const [availability, setAvailability]   = useState<AvailabilityResult[]>([])
  const [loadingSlots, setLoadingSlots]   = useState(false)
  const [slotsError, setSlotsError]       = useState('')

  // 已选时段选项
  const [selectedOption, setSelectedOption] = useState<{
    startTime: string; durationMinutes: number; displayTag: string
  } | null>(null)

  // 表单
  const [form, setForm]         = useState({ name: '', phone: '', remark: '' })
  const [formErrors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bookingResult, setBookingResult] = useState<{
    bookingId: string; assignedTableCode: string; endTime: string
  } | null>(null)

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
  const fetchAvailability = useCallback(async () => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlotsError('')
    setSelectedOption(null)
    try {
      const params = new URLSearchParams({
        date:           selectedDate,
        partySize:      String(partySize),
        acceptsSharing: String(acceptsSharing),
      })
      if (filterTime)     params.set('startTime', filterTime)
      if (filterDuration) params.set('durationMinutes', String(filterDuration))
      const res  = await fetch(`/api/availability?${params}`)
      const data = await res.json()
      setAvailability(data.results ?? [])
    } catch {
      setSlotsError('加载失败，请重试')
    } finally { setLoadingSlots(false) }
  }, [selectedDate, partySize, acceptsSharing, filterTime, filterDuration])

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

  // ── 时长格式化 ────────────────────────────────────────────────────────────
  function fmtDuration(min: number) {
    const h = min / 60
    return h === Math.floor(h) ? `${h}小时` : `${h}小时`
  }

  // ── 所有可选时长列表（从配置生成） ───────────────────────────────────────
  const allDurations = useMemo(() => {
    const { minDurationMinutes: min, maxDurationMinutes: max, durationStepMinutes: step } = BUSINESS_CONFIG
    const list: number[] = []
    for (let d = min; d <= max; d += step) list.push(d)
    return list
  }, [])

  // ── 所有出现的开始时间（从结果中提取） ───────────────────────────────────
  const allStartTimes = useMemo(() => {
    return [...new Set(availability.map(r => r.startTime))].sort()
  }, [availability])

  // ── 过滤后的结果 ──────────────────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    return availability.filter(r => {
      if (filterTime && r.startTime !== filterTime) return false
      if (filterDuration) {
        const hasMatch = r.options.some(o => o.durationMinutes === filterDuration)
        return hasMatch
      }
      return true
    }).map(r => ({
      ...r,
      options: filterDuration
        ? r.options.filter(o => o.durationMinutes === filterDuration)
        : r.options,
    }))
  }, [availability, filterTime, filterDuration])

  // ── 表单校验 ──────────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim())  e.name  = '请输入姓名'
    if (!form.phone.trim()) e.phone = '请输入手机号'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── 提交预约 ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !selectedOption || !selectedDate) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res  = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:            selectedDate,
          partySize,
          acceptsSharing,
          startTime:       selectedOption.startTime,
          durationMinutes: selectedOption.durationMinutes,
          customerName:    form.name,
          phone:           form.phone,
          remark:          form.remark || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error ?? '提交失败，请重试'); return }
      setBookingResult({ bookingId: data.bookingId, assignedTableCode: data.assignedTableCode, endTime: data.endTime })
      setStep('done')
    } catch {
      setSubmitError('网络错误，请检查连接后重试')
    } finally { setSubmitting(false) }
  }

  function resetAll() {
    setStep('date'); setDate(null); setPartySize(1); setSharing(false)
    setFilterTime(null); setFilterDuration(null); setAvailability([])
    setSelectedOption(null)
    setForm({ name: '', phone: '', remark: '' })
    setErrors({}); setSubmitError(''); setBookingResult(null)
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">

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
                const past    = isPast(day)
                const blocked = isBlocked(day)
                const sel     = selectedDate === key
                const isToday = key === today
                const disabled = past || blocked

                return (
                  <button key={day} disabled={disabled} onClick={() => setDate(key)}
                    className={cn(
                      'relative aspect-square rounded-xl text-sm font-medium transition-all duration-200',
                      sel             ? 'bg-terracotta text-white shadow-warm scale-105' :
                      past || blocked ? 'text-charcoal-light/25 cursor-not-allowed' :
                                        'bg-warm-100 text-charcoal hover:bg-sand-200 hover:scale-105'
                    )}
                  >
                    {day}
                    {isToday && !sel && !past && (
                      <span className="absolute top-0.5 right-1 text-[8px] text-terracotta font-bold leading-none">今</span>
                    )}
                    {!sel && !past && !blocked && (
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

        {/* ── STEP 3: 可用时段（按钮式） ───────────────────────────────────── */}
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
              <p className="text-sm text-charcoal-light mb-5">
                {selectedDate} · {partySize === 3 ? '3-4人' : `${partySize}人`}
                {acceptsSharing && ' · 接受拼桌'}
              </p>

              {/* 可选筛选器 */}
              {!loadingSlots && availability.length > 0 && (
                <div className="mb-5 space-y-2">
                  {/* 时间筛选 */}
                  {allStartTimes.length > 1 && (
                    <div>
                      <p className="text-xs text-charcoal-light mb-1.5">按开始时间筛选（可选）</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => setFilterTime(null)}
                          className={cn('rounded-full border px-2.5 py-1 text-xs transition-all',
                            !filterTime ? 'border-terracotta bg-terracotta/10 text-terracotta font-medium' : 'border-sand-200 text-charcoal-light hover:border-terracotta/40'
                          )}>全部</button>
                        {allStartTimes.map(t => (
                          <button key={t} onClick={() => setFilterTime(filterTime === t ? null : t)}
                            className={cn('rounded-full border px-2.5 py-1 text-xs transition-all',
                              filterTime === t ? 'border-terracotta bg-terracotta/10 text-terracotta font-medium' : 'border-sand-200 text-charcoal-light hover:border-terracotta/40'
                            )}>{t}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 时长筛选 */}
                  <div>
                    <p className="text-xs text-charcoal-light mb-1.5">按时长筛选（可选）</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterDuration(null)}
                        className={cn('rounded-full border px-2.5 py-1 text-xs transition-all',
                          !filterDuration ? 'border-terracotta bg-terracotta/10 text-terracotta font-medium' : 'border-sand-200 text-charcoal-light hover:border-terracotta/40'
                        )}>全部</button>
                      {allDurations.map(d => (
                        <button key={d} onClick={() => setFilterDuration(filterDuration === d ? null : d)}
                          className={cn('rounded-full border px-2.5 py-1 text-xs transition-all',
                            filterDuration === d ? 'border-terracotta bg-terracotta/10 text-terracotta font-medium' : 'border-sand-200 text-charcoal-light hover:border-terracotta/40'
                          )}>{fmtDuration(d)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 时段结果 */}
              {loadingSlots ? (
                <div className="py-10 text-center text-sm text-charcoal-light animate-pulse">加载可用时段中…</div>
              ) : slotsError ? (
                <div className="py-8 text-center text-sm text-red-500">{slotsError}</div>
              ) : filteredResults.length === 0 ? (
                <div className="text-center py-10 text-charcoal-light">
                  <AlertCircle className="mx-auto mb-2 text-sand-300" size={32} />
                  <p className="text-sm">该日期暂无可约时段</p>
                  <p className="text-xs mt-1 text-charcoal-light/60">请尝试换个日期，或关闭拼桌限制</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredResults.map((row: AvailabilityResult) => (
                    <div key={row.startTime} className="flex gap-3 items-start">
                      {/* 时间标签 */}
                      <div className="shrink-0 w-14 text-right">
                        <span className="font-mono font-semibold text-charcoal text-sm">{row.startTime}</span>
                      </div>
                      {/* 选项按钮组 */}
                      <div className="flex flex-wrap gap-2">
                        {row.options.map((opt: AvailabilityOption) => {
                          const key = `${row.startTime}_${opt.durationMinutes}_${opt.isSharedOption}`
                          const sel = selectedOption?.startTime === row.startTime
                            && selectedOption.durationMinutes === opt.durationMinutes
                            && selectedOption.displayTag === opt.displayTag
                          return (
                            <button key={key}
                              onClick={() => setSelectedOption({ startTime: row.startTime, durationMinutes: opt.durationMinutes, displayTag: opt.displayTag })}
                              className={cn(
                                'rounded-xl border-2 px-3 py-1.5 text-xs font-medium transition-all',
                                sel
                                  ? 'border-terracotta bg-terracotta text-white shadow-warm scale-105'
                                  : opt.isSharedOption
                                    ? 'border-sage/60 bg-sage/5 text-sage-dark hover:border-sage hover:bg-sage/10'
                                    : 'border-sand-200 bg-warm-50 text-charcoal hover:border-terracotta/50 hover:bg-terracotta/5'
                              )}
                            >
                              {fmtDuration(opt.durationMinutes)}｜{opt.displayTag}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                      placeholder="请输入您的真实姓名"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                    {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="phone">手机号 *</label>
                    <input id="phone" type="tel"
                      className={cn('input-field', formErrors.phone && 'border-red-400 focus:ring-red-200')}
                      placeholder="请输入手机号（英国/国内均可）"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                    />
                    {formErrors.phone && <p className="mt-1 text-xs text-red-500">{formErrors.phone}</p>}
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

                {submitError && (
                  <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                    {submitError}
                  </div>
                )}

                <button type="submit" disabled={submitting} className="btn-primary w-full mt-6 py-3.5 text-base">
                  {submitting ? '提交中…' : '确认提交预约'}
                  {!submitting && <CheckCircle2 size={18} />}
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
              <p className="text-charcoal-light">📞 {form.phone}</p>
            </div>

            <button onClick={resetAll} className="btn-secondary">再次预约</button>
          </div>
        )}

      </div>
    </div>
  )
}
