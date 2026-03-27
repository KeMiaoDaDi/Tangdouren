'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Clock, Users, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 伦敦本地时间工具 ──────────────────────────────────────────────────────────
const TZ = 'Europe/London'

function todayLondon(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date())
}

function nowTimeLondon(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

function getLondonYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const year  = parseInt(parts.find(p => p.type === 'year')!.value)
  const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1
  return { year, month }
}

// ─── 类型 ──────────────────────────────────────────────────────────────────────
interface ApiSlot {
  id:        string
  date:      string
  startTime: string
  endTime:   string
  label:     string
  capacity:  number
  booked:    number
}

type Step = 'date' | 'slot' | 'form' | 'done'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay() }
function pad(n: number) { return String(n).padStart(2, '0') }
function dateKey(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

export default function BookingPage() {
  const today = useMemo(() => todayLondon(), [])
  const { year: initYear, month: initMonth } = useMemo(() => getLondonYearMonth(), [])

  const [step, setStep]         = useState<Step>('date')
  const [year, setYear]         = useState(initYear)
  const [month, setMonth]       = useState(initMonth)
  const [selectedDate, setDate] = useState<string | null>(null)
  const [selectedSlot, setSlot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [form, setForm] = useState({
    name: '', contact: '', contactType: 'wechat', partySize: '1', note: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── 真实 API 数据 ──────────────────────────────────────────────────────────
  const [slotMap,      setSlotMap]      = useState<Record<string, ApiSlot[]>>({})
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const fetchSlots = useCallback(async (y: number, m: number) => {
    setLoadingSlots(true)
    try {
      const res  = await fetch(`/api/slots?year=${y}&month=${m + 1}`)
      const data = await res.json()
      if (data.slots) {
        const map: Record<string, ApiSlot[]> = {}
        ;(data.slots as ApiSlot[]).forEach(s => {
          if (!map[s.date]) map[s.date] = []
          map[s.date].push(s)
        })
        setSlotMap(map)
      }
      if (data.blockedDates) setBlockedDates(data.blockedDates)
    } catch {
      // 网络错误时静默降级
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => { fetchSlots(year, month) }, [year, month, fetchSlots])

  // ─────────────────────────────────────────────────────────────────────────
  const daysInMonth  = getDaysInMonth(year, month)
  const firstDay     = getFirstDayOfMonth(year, month)
  const nowTime      = nowTimeLondon()
  const isCurrentMonth = year === initYear && month === initMonth

  const slotsForDate = useMemo(() => {
    if (!selectedDate) return []
    const raw = slotMap[selectedDate] ?? []
    if (selectedDate === today) {
      return raw.filter(s => s.startTime > nowTime)
    }
    return raw
  }, [selectedDate, slotMap, today, nowTime])

  const currentSlot = slotsForDate.find(s => s.id === selectedSlot)

  function prevMonth() {
    if (isCurrentMonth) return
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function isPastDate(day: number): boolean { return dateKey(year, month, day) < today }
  function isBlocked(day: number): boolean  { return blockedDates.includes(dateKey(year, month, day)) }

  function isFull(day: number): boolean {
    const key   = dateKey(year, month, day)
    const slots = slotMap[key]
    if (!slots || slots.length === 0) return false
    if (key === today) {
      const future = slots.filter(s => s.startTime > nowTime)
      return future.length > 0 && future.every(s => s.booked >= s.capacity)
    }
    return slots.every(s => s.booked >= s.capacity)
  }

  function hasAvailableSlots(day: number): boolean {
    const key   = dateKey(year, month, day)
    const slots = slotMap[key]
    if (!slots || slots.length === 0) return false
    if (key === today) return slots.some(s => s.startTime > nowTime && s.booked < s.capacity)
    return slots.some(s => s.booked < s.capacity)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim())    e.name    = '请输入您的姓名'
    if (!form.contact.trim()) e.contact = '请输入联系方式'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !selectedSlot) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res  = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId:       selectedSlot,
          customerName: form.name,
          contact:      form.contact,
          contactType:  form.contactType,
          partySize:    parseInt(form.partySize),
          note:         form.note || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? '提交失败，请重试')
        return
      }
      setBookingId(data.bookingId ?? '')
      setStep('done')
    } catch {
      setSubmitError('网络错误，请检查连接后重试')
    } finally {
      setSubmitting(false)
    }
  }

  function resetAll() {
    setStep('date'); setDate(null); setSlot(null)
    setForm({ name: '', contact: '', contactType: 'wechat', partySize: '1', note: '' })
    setErrors({}); setSubmitError(''); setBookingId('')
  }

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">

        {/* Page title */}
        <div className="text-center mb-10">
          <span className="text-terracotta text-sm font-medium tracking-wider uppercase">在线预约</span>
          <h1 className="font-display text-3xl font-bold text-charcoal mt-2 sm:text-4xl">预约你的拼豆时光</h1>
          <p className="text-charcoal-light mt-2 text-sm">选择日期 → 选择时段 → 填写信息</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {(['date', 'slot', 'form', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                step === s          ? 'bg-terracotta text-white shadow-warm' :
                isStepDone(s, step) ? 'bg-sage text-white' :
                                      'bg-sand-200 text-charcoal-light'
              )}>
                {isStepDone(s, step) ? '✓' : i + 1}
              </div>
              {i < 3 && <div className={cn('h-px w-8 sm:w-16 transition-all', isStepDone(s, step) ? 'bg-sage' : 'bg-sand-200')} />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Date picker ──────────────────────────────────────── */}
        {step === 'date' && (
          <div className="card p-6 sm:p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-xl font-semibold text-charcoal">选择预约日期</h2>
              <span className="text-xs text-charcoal-light bg-warm-100 px-2 py-1 rounded-full">
                🇬🇧 伦敦时间
              </span>
            </div>
            <p className="text-xs text-charcoal-light mb-6">
              今日：{today}（过去日期不可选）{loadingSlots && <span className="ml-2 animate-pulse text-terracotta">加载中…</span>}
            </p>

            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={prevMonth}
                disabled={isCurrentMonth}
                className={cn('btn-ghost p-2', isCurrentMonth && 'opacity-30 cursor-not-allowed')}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-display font-semibold text-charcoal">
                {year} 年 {MONTHS[month]}
              </span>
              <button onClick={nextMonth} className="btn-ghost p-2">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-charcoal-light py-1">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day   = i + 1
                const key   = dateKey(year, month, day)
                const past    = isPastDate(day)
                const blocked = isBlocked(day)
                const full    = isFull(day)
                const avail   = hasAvailableSlots(day)
                const isToday = key === today
                const sel     = selectedDate === key
                const disabled = past || blocked || full || !avail

                return (
                  <button
                    key={day}
                    disabled={disabled}
                    onClick={() => setDate(key)}
                    className={cn(
                      'relative aspect-square rounded-xl text-sm font-medium transition-all duration-200',
                      sel             ? 'bg-terracotta text-white shadow-warm scale-105' :
                      past || blocked ? 'text-charcoal-light/25 cursor-not-allowed' :
                      avail           ? 'bg-warm-100 text-charcoal hover:bg-sand-200 hover:scale-105' :
                      full            ? 'bg-red-50 text-red-300 cursor-not-allowed line-through' :
                                        'text-charcoal-light/30 cursor-default'
                    )}
                  >
                    {day}
                    {isToday && !sel && !past && (
                      <span className="absolute top-0.5 right-1 text-[8px] text-terracotta font-bold leading-none">今</span>
                    )}
                    {avail && !sel && !past && !blocked && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-terracotta/60" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-5 text-xs text-charcoal-light">
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warm-100 border border-sand-200" />可预约</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-terracotta" />已选</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-red-100" />已满</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warm-50 border border-sand-100 opacity-40" />不可预约/已过</div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                disabled={!selectedDate}
                onClick={() => setStep('slot')}
                className="btn-primary"
              >
                下一步：选择时段
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Slot picker ──────────────────────────────────────── */}
        {step === 'slot' && (
          <div className="animate-fade-in">
            <button onClick={() => setStep('date')} className="btn-ghost mb-4 text-sm">
              <ChevronLeft size={14} /> 返回修改日期
            </button>
            <div className="card p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-charcoal mb-1">选择时段</h2>
              <p className="text-sm text-charcoal-light mb-1">{selectedDate}</p>
              {selectedDate === today && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-4 inline-block">
                  ⏰ 今日预约，已过时段不可选（伦敦时间 {nowTime}）
                </p>
              )}

              {loadingSlots ? (
                <div className="py-10 text-center text-sm text-charcoal-light">加载时段中…</div>
              ) : slotsForDate.length === 0 ? (
                <div className="text-center py-10 text-charcoal-light">
                  <AlertCircle className="mx-auto mb-2 text-sand-300" size={32} />
                  <p>{selectedDate === today ? '今日剩余时段已全部过期' : '该日期暂无可用时段'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {slotsForDate.map(slot => {
                    const full = slot.booked >= slot.capacity
                    const sel  = selectedSlot === slot.id
                    return (
                      <button
                        key={slot.id}
                        disabled={full}
                        onClick={() => setSlot(slot.id)}
                        className={cn(
                          'w-full rounded-2xl border-2 p-4 text-left transition-all duration-200',
                          sel  ? 'border-terracotta bg-terracotta/5 shadow-warm' :
                          full ? 'border-sand-200 bg-warm-50 opacity-50 cursor-not-allowed' :
                                 'border-sand-200 hover:border-terracotta/40 hover:bg-warm-50'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-charcoal">{slot.label}</span>
                              {full
                                ? <span className="badge-cancelled text-xs">已满</span>
                                : <span className="badge-confirmed text-xs">剩 {slot.capacity - slot.booked} 位</span>
                              }
                            </div>
                            <div className="flex items-center gap-1 mt-1 text-sm text-charcoal-light">
                              <Clock size={12} />
                              <span>{slot.startTime} – {slot.endTime}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-charcoal-light">
                            <Users size={12} />
                            <span>{slot.booked}/{slot.capacity}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  disabled={!selectedSlot}
                  onClick={() => setStep('form')}
                  className="btn-primary"
                >
                  下一步：填写信息
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Form ─────────────────────────────────────────────── */}
        {step === 'form' && (
          <div className="animate-fade-in">
            <button onClick={() => setStep('slot')} className="btn-ghost mb-4 text-sm">
              <ChevronLeft size={14} /> 返回选择时段
            </button>
            <div className="card p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-charcoal mb-1">填写预约信息</h2>
              <p className="text-sm text-charcoal-light mb-6">
                {selectedDate} · {currentSlot?.label} · {currentSlot?.startTime}–{currentSlot?.endTime}
              </p>

              <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-5">

                  {/* Name */}
                  <div>
                    <label className="label" htmlFor="name">姓名 *</label>
                    <input
                      id="name"
                      className={cn('input-field', errors.name && 'border-red-400 focus:ring-red-200')}
                      placeholder="请输入您的真实姓名"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="label">联系方式 *</label>
                    <div className="flex gap-2">
                      <select
                        className="input-field w-28 shrink-0"
                        value={form.contactType}
                        onChange={e => setForm({ ...form, contactType: e.target.value })}
                      >
                        <option value="wechat">微信号</option>
                        <option value="phone">手机号</option>
                      </select>
                      <input
                        className={cn('input-field flex-1', errors.contact && 'border-red-400 focus:ring-red-200')}
                        placeholder={form.contactType === 'wechat' ? '请输入微信号' : '请输入手机号'}
                        value={form.contact}
                        onChange={e => setForm({ ...form, contact: e.target.value })}
                      />
                    </div>
                    {errors.contact && <p className="mt-1 text-xs text-red-500">{errors.contact}</p>}
                  </div>

                  {/* Party size */}
                  <div>
                    <label className="label" htmlFor="partySize">参与人数</label>
                    <select
                      id="partySize"
                      className="input-field"
                      value={form.partySize}
                      onChange={e => setForm({ ...form, partySize: e.target.value })}
                    >
                      {Array.from({ length: currentSlot ? currentSlot.capacity - currentSlot.booked : 4 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} 人</option>
                      ))}
                    </select>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="label" htmlFor="note">备注（可选）</label>
                    <textarea
                      id="note"
                      rows={3}
                      className="input-field resize-none"
                      placeholder="如：有小朋友一起来、希望座位靠窗…"
                      value={form.note}
                      onChange={e => setForm({ ...form, note: e.target.value })}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-6 rounded-2xl bg-warm-50 border border-sand-200 p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-charcoal mb-2">预约摘要</p>
                  <p className="text-charcoal-light">📅 日期：{selectedDate}</p>
                  <p className="text-charcoal-light">⏰ 时段：{currentSlot?.label} · {currentSlot?.startTime}–{currentSlot?.endTime}</p>
                  <p className="text-charcoal-light">👥 人数：{form.partySize} 人</p>
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

        {/* ── Step 4: Success ──────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="card p-8 text-center animate-fade-in">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-sage/10">
              <CheckCircle2 size={40} className="text-sage" />
            </div>
            <h2 className="font-display text-2xl font-bold text-charcoal mb-2">预约成功！</h2>
            <p className="text-charcoal-light mb-2">
              您的预约已自动确认，名额已为您锁定。
            </p>
            <p className="text-sm text-charcoal-light/60 mb-8">如需变更或取消，请通过下方联系方式告知工作室。</p>

            <div className="rounded-2xl bg-warm-50 border border-sand-200 p-4 text-sm text-left space-y-2 mb-8">
              <p className="font-semibold text-charcoal mb-2">您的预约详情</p>
              {bookingId && <p className="text-xs text-charcoal-light/70">编号：{bookingId.slice(0, 8)}…</p>}
              <p className="text-charcoal-light">📅 {selectedDate}</p>
              <p className="text-charcoal-light">⏰ {currentSlot?.label} · {currentSlot?.startTime}–{currentSlot?.endTime}</p>
              <p className="text-charcoal-light">👤 {form.name} · {form.partySize} 人</p>
              <p className="text-charcoal-light">📱 {form.contact}</p>
            </div>

            <button onClick={resetAll} className="btn-secondary">
              再次预约
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function isStepDone(s: Step, current: Step): boolean {
  const order: Step[] = ['date', 'slot', 'form', 'done']
  return order.indexOf(s) < order.indexOf(current)
}
