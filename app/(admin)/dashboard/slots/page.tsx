'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, CalendarOff, RefreshCw, UserPlus, CheckCircle2, Clock } from 'lucide-react'
import { TABLE_DEFINITIONS } from '@/lib/booking/config'
import { cn } from '@/lib/utils'

interface Blocked { date: string; reason?: string }

interface BlockedSlot {
  id:         string
  date:       string
  start_time: string
  end_time:   string
  reason:     string | null
}

interface RecentBooking {
  bookingId:  string
  date:       string
  startTime:  string
  endTime:    string
  tableCode:  string
  customerName: string
}

const TABLE_CODES = TABLE_DEFINITIONS.map(t => t.tableCode)
const TABLE_TYPE_LABEL: Record<string, string> = { single: '单人', double: '双人', four: '四人' }

function londonDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date())
}

export default function SlotsPage() {
  // ── 手动预约表单 ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    date:         londonDate(),
    startTime:    '11:00',
    endTime:      '12:00',
    tableCode:    TABLE_CODES[0] ?? '',
    customerName: '',
    email:        '',
    remark:       '',
  })
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')
  const [recentList,  setRecentList]  = useState<RecentBooking[]>([])
  const [successMsg,  setSuccessMsg]  = useState('')

  async function submitManualBooking(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setSuccessMsg('')
    if (!form.customerName.trim()) { setFormError('请填写客户姓名'); return }
    setSaving(true)
    try {
      const res  = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:         form.date,
          startTime:    form.startTime,
          endTime:      form.endTime,
          tableCode:    form.tableCode,
          customerName: form.customerName.trim(),
          email:        form.email.trim() || undefined,
          remark:       form.remark.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? '创建失败'); return }

      const newEntry: RecentBooking = {
        bookingId:    data.bookingId,
        date:         form.date,
        startTime:    form.startTime,
        endTime:      form.endTime,
        tableCode:    form.tableCode,
        customerName: form.customerName.trim(),
      }
      setRecentList(prev => [newEntry, ...prev].slice(0, 8))
      setSuccessMsg(`✓ 已为「${form.customerName.trim()}」创建预约 (${form.date} ${form.startTime}–${form.endTime} · ${form.tableCode})`)
      setForm(f => ({ ...f, customerName: '', email: '', remark: '' }))
    } finally {
      setSaving(false)
    }
  }

  // ── 封禁日期 ────────────────────────────────────────────────────────────────
  const [blocked,    setBlocked]    = useState<Blocked[]>([])
  const [blockLoad,  setBlockLoad]  = useState(true)
  const [blockSaving, setBlockSaving] = useState(false)
  const [blockForm,  setBlockForm]  = useState({ date: '', reason: '' })

  const fetchBlocked = useCallback(async () => {
    setBlockLoad(true)
    try {
      // blocked-dates API returns an array of date strings for a given month;
      // fetch next 3 months to show all upcoming blocked dates
      const results: string[] = []
      const now = new Date()
      for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        const res  = await fetch(`/api/blocked-dates?year=${y}&month=${m}`)
        const data = await res.json()
        if (Array.isArray(data)) results.push(...data.map((x: { date: string } | string) => typeof x === 'string' ? x : x.date))
      }
      const unique = [...new Set(results)].sort()
      setBlocked(unique.map(date => ({ date })))
    } finally {
      setBlockLoad(false)
    }
  }, [])

  useEffect(() => { fetchBlocked() }, [fetchBlocked])

  async function addBlock() {
    if (!blockForm.date) return
    setBlockSaving(true)
    try {
      await fetch('/api/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: blockForm.date, reason: blockForm.reason }),
      })
      setBlockForm({ date: '', reason: '' })
      await fetchBlocked()
    } finally { setBlockSaving(false) }
  }

  async function removeBlock(date: string) {
    setBlockSaving(true)
    try {
      await fetch(`/api/blocked-dates?date=${date}`, { method: 'DELETE' })
      await fetchBlocked()
    } finally { setBlockSaving(false) }
  }

  // ── 封禁时段 ────────────────────────────────────────────────────────────────
  const [blockedSlots,     setBlockedSlots]     = useState<BlockedSlot[]>([])
  const [slotLoad,         setSlotLoad]         = useState(true)
  const [slotSaving,       setSlotSaving]       = useState(false)
  const [slotForm,         setSlotForm]         = useState({
    date: londonDate(), start_time: '11:00', end_time: '13:00', reason: '',
  })
  const [slotError,        setSlotError]        = useState('')

  const fetchBlockedSlots = useCallback(async () => {
    setSlotLoad(true)
    try {
      const now = new Date()
      // 拉取今天起 3 个月内的封禁时段
      const from = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(now)
      const toDate = new Date(now.getFullYear(), now.getMonth() + 3, 0)
      const to = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(toDate)
      const res = await fetch(`/api/blocked-slots?from=${from}&to=${to}`)
      const data = await res.json()
      if (Array.isArray(data)) setBlockedSlots(data)
    } finally { setSlotLoad(false) }
  }, [])

  useEffect(() => { fetchBlockedSlots() }, [fetchBlockedSlots])

  async function addBlockedSlot() {
    setSlotError('')
    if (!slotForm.date || !slotForm.start_time || !slotForm.end_time) {
      setSlotError('请填写日期和时间段'); return
    }
    if (slotForm.start_time >= slotForm.end_time) {
      setSlotError('结束时间必须晚于开始时间'); return
    }
    setSlotSaving(true)
    try {
      const res = await fetch('/api/blocked-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotForm),
      })
      const data = await res.json()
      if (!res.ok) { setSlotError(data.error ?? '添加失败'); return }
      setSlotForm(f => ({ ...f, reason: '' }))
      await fetchBlockedSlots()
    } finally { setSlotSaving(false) }
  }

  async function removeBlockedSlot(id: string) {
    setSlotSaving(true)
    try {
      await fetch(`/api/blocked-slots?id=${id}`, { method: 'DELETE' })
      await fetchBlockedSlots()
    } finally { setSlotSaving(false) }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">席位管理</h1>
        <p className="text-sm text-charcoal-light mt-0.5">管理员手动预约 · 封禁时段 · 封禁日期</p>
      </div>

      {/* ── 手动预约 ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 p-5 border-b border-sand-100">
          <UserPlus size={16} className="text-terracotta" />
          <h2 className="font-semibold text-charcoal text-sm">手动创建预约</h2>
          <span className="ml-auto text-xs text-charcoal-light">直接确认，无需定金</span>
        </div>

        <form onSubmit={submitManualBooking} className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="label text-xs">日期 *</label>
              <input type="date" required className="input-field text-sm py-2"
                value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">开始时间 *</label>
              <input type="time" required className="input-field text-sm py-2"
                min="11:00" max="21:00" step="1800"
                value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">结束时间 *</label>
              <input type="time" required className="input-field text-sm py-2"
                min="11:00" max="21:00" step="1800"
                value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">桌位 *</label>
              <select required className="input-field text-sm py-2"
                value={form.tableCode} onChange={e => setForm(f => ({ ...f, tableCode: e.target.value as typeof TABLE_CODES[number] }))}>
                {(['single', 'double', 'four'] as const).map(type => (
                  <optgroup key={type} label={`${TABLE_TYPE_LABEL[type]}桌`}>
                    {TABLE_DEFINITIONS.filter(t => t.tableType === type).map(t => (
                      <option key={t.tableCode} value={t.tableCode}>{t.tableCode}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label text-xs">客户姓名 *</label>
              <input required className="input-field text-sm py-2" placeholder="预约人姓名"
                value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label text-xs">邮箱（可选）</label>
              <input type="email" className="input-field text-sm py-2" placeholder="如需发送通知"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="label text-xs">备注（可选）</label>
              <input className="input-field text-sm py-2" placeholder="如有特殊需求"
                value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{formError}</p>
          )}
          {successMsg && (
            <p className="text-sm text-sage-dark bg-sage/10 rounded-xl px-4 py-2 flex items-center gap-2">
              <CheckCircle2 size={14} /> {successMsg}
            </p>
          )}

          <button type="submit" disabled={saving}
            className="btn-primary text-sm gap-1.5 disabled:opacity-50">
            <Plus size={14} />
            {saving ? '创建中…' : '创建预约'}
          </button>
        </form>

        {/* 最近创建记录 */}
        {recentList.length > 0 && (
          <div className="border-t border-sand-100 px-5 py-3">
            <p className="text-xs text-charcoal-light mb-2">本次会话已创建：</p>
            <div className="space-y-1">
              {recentList.map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-charcoal">
                  <span className="text-sage-dark font-medium">✓</span>
                  <span className="font-medium">{b.customerName}</span>
                  <span className="text-charcoal-light">{b.date} · {b.startTime}–{b.endTime}</span>
                  <span className="rounded bg-warm-100 px-1.5 py-0.5 font-medium">{b.tableCode}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 封禁时段 ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="p-5 border-b border-sand-100 flex items-center justify-between">
          <h2 className="font-semibold text-charcoal text-sm flex items-center gap-2">
            <Clock size={15} className="text-terracotta" />
            封禁特定时段
          </h2>
          <button onClick={fetchBlockedSlots} disabled={slotLoad} className="btn-secondary text-xs px-3 py-1.5">
            <RefreshCw size={12} className={cn(slotLoad && 'animate-spin')} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-charcoal-light">设置某天的某个时间段不可预约（如下午场暂停接待、包场活动等）</p>

          {/* 添加表单 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <label className="label text-xs">日期 *</label>
              <input type="date" className="input-field text-xs py-2"
                value={slotForm.date}
                onChange={e => setSlotForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">开始时间 *</label>
              <input type="time" className="input-field text-xs py-2"
                value={slotForm.start_time}
                onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">结束时间 *</label>
              <input type="time" className="input-field text-xs py-2"
                value={slotForm.end_time}
                onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">原因（可选）</label>
              <input className="input-field text-xs py-2" placeholder="如：包场活动"
                value={slotForm.reason}
                onChange={e => setSlotForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <button onClick={addBlockedSlot} disabled={slotSaving}
                className="btn-primary text-xs w-full py-2 gap-1.5 disabled:opacity-50">
                <Plus size={13} /> 添加
              </button>
            </div>
          </div>

          {slotError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-xl px-4 py-2">{slotError}</p>
          )}

          {/* 已有封禁时段列表 */}
          <div className="space-y-1.5">
            {blockedSlots.map(slot => (
              <div key={slot.id} className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                <Clock size={12} className="text-amber-500 shrink-0" />
                <span className="font-semibold text-amber-800">{slot.date}</span>
                <span className="text-amber-700">{slot.start_time} – {slot.end_time}</span>
                {slot.reason && <span className="text-amber-600">· {slot.reason}</span>}
                <button onClick={() => removeBlockedSlot(slot.id)} disabled={slotSaving}
                  className="ml-auto text-amber-400 hover:text-amber-700 font-bold disabled:opacity-50 text-sm leading-none">
                  ×
                </button>
              </div>
            ))}
            {!slotLoad && blockedSlots.length === 0 && (
              <p className="text-xs text-charcoal-light">暂无封禁时段</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 封禁日期 ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="p-5 border-b border-sand-100 flex items-center justify-between">
          <h2 className="font-semibold text-charcoal text-sm flex items-center gap-2">
            <CalendarOff size={15} className="text-terracotta" />
            封禁日期
          </h2>
          <button onClick={fetchBlocked} disabled={blockLoad} className="btn-secondary text-xs px-3 py-1.5">
            <RefreshCw size={12} className={cn(blockLoad && 'animate-spin')} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <input type="date" className="input-field text-xs py-2 w-36"
              value={blockForm.date}
              onChange={e => setBlockForm(f => ({ ...f, date: e.target.value }))} />
            <input className="input-field text-xs py-2 flex-1 min-w-32"
              placeholder="封禁原因（可选）"
              value={blockForm.reason}
              onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} />
            <button onClick={addBlock} disabled={blockSaving || !blockForm.date}
              className="btn-primary text-xs px-4 py-2 gap-1.5 disabled:opacity-50">
              <Plus size={13} /> 添加
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {blocked.map(({ date, reason }) => (
              <div key={date} className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs">
                <CalendarOff size={12} className="text-red-400" />
                <span className="font-medium text-red-700">{date}</span>
                {reason && <span className="text-red-500">· {reason}</span>}
                <button onClick={() => removeBlock(date)} disabled={blockSaving}
                  className="ml-1 text-red-400 hover:text-red-600 disabled:opacity-50">×</button>
              </div>
            ))}
            {!blockLoad && blocked.length === 0 && (
              <p className="text-xs text-charcoal-light">暂无封禁日期</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
