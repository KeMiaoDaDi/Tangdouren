'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, CalendarOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Slot {
  id:        string
  date:      string
  startTime: string
  endTime:   string
  label:     string
  capacity:  number
  booked:    number
  isActive?: boolean
}

interface Blocked { date: string; reason?: string }

function getLondonMonth() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }))
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default function SlotsPage() {
  const { year: initY, month: initM } = getLondonMonth()
  const [year,    setYear]    = useState(initY)
  const [month,   setMonth]   = useState(initM)
  const [slots,   setSlots]   = useState<Slot[]>([])
  const [blocked, setBlocked] = useState<Blocked[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '10:00', endTime: '12:00', label: '上午场', capacity: '4' })
  const [blockForm, setBlockForm] = useState({ date: '', reason: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/slots?year=${year}&month=${month}`)
      const data = await res.json()
      if (data.slots) {
        setSlots(data.slots.map((s: Slot & { is_active?: boolean }) => ({
          ...s,
          isActive: s.is_active !== false,
        })))
      }
      if (data.blockedDates) {
        setBlocked(data.blockedDates.map((d: string) => ({ date: d })))
      }
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleActive(slot: Slot) {
    setSaving(true)
    try {
      await fetch(`/api/slots/${slot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !slot.isActive }),
      })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function removeSlot(slot: Slot) {
    if (!confirm(`确认删除 ${slot.date} ${slot.label}？`)) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/slots/${slot.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function addSlot() {
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) return
    setSaving(true)
    try {
      const res  = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:        newSlot.date,
          start_time:  newSlot.startTime,
          end_time:    newSlot.endTime,
          label:       newSlot.label,
          capacity:    parseInt(newSlot.capacity),
          project_type: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      setShowAdd(false)
      setNewSlot({ date: '', startTime: '10:00', endTime: '12:00', label: '上午场', capacity: '4' })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function addBlock() {
    if (!blockForm.date) return
    setSaving(true)
    try {
      await fetch('/api/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: blockForm.date, reason: blockForm.reason }),
      })
      setBlockForm({ date: '', reason: '' })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function removeBlock(date: string) {
    setSaving(true)
    try {
      await fetch(`/api/blocked-dates?date=${date}`, { method: 'DELETE' })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const monthLabel = `${year} 年 ${month} 月`

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Slot 配置</h1>
          <p className="text-sm text-charcoal-light mt-0.5">管理可预约时段与封禁日期</p>
        </div>
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn-secondary text-xs px-3 py-2">←</button>
          <span className="text-sm font-medium text-charcoal w-24 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="btn-secondary text-xs px-3 py-2">→</button>
          <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs px-3 py-2 ml-1">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Slot list */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-sand-100">
          <h2 className="font-semibold text-charcoal text-sm">时段列表</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs gap-1.5 px-3 py-2">
            <Plus size={13} />
            新增 Slot
          </button>
        </div>

        {showAdd && (
          <div className="p-5 bg-warm-50 border-b border-sand-100">
            <h3 className="text-sm font-semibold text-charcoal mb-4">新增 Slot</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="label text-xs">日期</label>
                <input type="date" className="input-field text-xs py-2" value={newSlot.date}
                  onChange={e => setNewSlot({ ...newSlot, date: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">开始时间</label>
                <input type="time" className="input-field text-xs py-2" value={newSlot.startTime}
                  onChange={e => setNewSlot({ ...newSlot, startTime: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">结束时间</label>
                <input type="time" className="input-field text-xs py-2" value={newSlot.endTime}
                  onChange={e => setNewSlot({ ...newSlot, endTime: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">最大人数</label>
                <input type="number" min={1} max={20} className="input-field text-xs py-2" value={newSlot.capacity}
                  onChange={e => setNewSlot({ ...newSlot, capacity: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label text-xs">显示名称</label>
                <input className="input-field text-xs py-2" placeholder="如：上午场" value={newSlot.label}
                  onChange={e => setNewSlot({ ...newSlot, label: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addSlot} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">保存 Slot</button>
              <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs px-4 py-2">取消</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-charcoal-light">加载中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-warm-50 text-xs text-charcoal-light">
                  <th className="text-left px-4 py-3 font-medium">日期</th>
                  <th className="text-left px-4 py-3 font-medium">时段</th>
                  <th className="text-center px-4 py-3 font-medium">占用</th>
                  <th className="text-center px-4 py-3 font-medium">状态</th>
                  <th className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {slots.map(slot => (
                  <tr key={slot.id} className={cn('hover:bg-warm-50 transition-colors', !slot.isActive && 'opacity-50')}>
                    <td className="px-4 py-3 text-xs text-charcoal">{slot.date}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-charcoal">{slot.label}</div>
                      <div className="text-xs text-charcoal-light">{slot.startTime}–{slot.endTime}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-xs text-charcoal">{slot.booked}/{slot.capacity}</div>
                      <div className="h-1 w-12 mx-auto mt-1 rounded-full bg-sand-200 overflow-hidden">
                        <div className="h-full rounded-full bg-terracotta" style={{ width: `${Math.min((slot.booked / slot.capacity) * 100, 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(slot)}
                        disabled={saving}
                        className="text-charcoal-light hover:text-terracotta transition-colors disabled:opacity-50"
                        title={slot.isActive ? '点击停用' : '点击启用'}
                      >
                        {slot.isActive
                          ? <ToggleRight size={20} className="text-sage" />
                          : <ToggleLeft size={20} />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeSlot(slot)}
                        disabled={saving || slot.booked > 0}
                        className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-charcoal-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={slot.booked > 0 ? '有预约，无法删除' : '删除'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {slots.length === 0 && (
              <div className="py-10 text-center text-sm text-charcoal-light">该月暂无 Slot，请点击"新增 Slot"创建</div>
            )}
          </div>
        )}
      </div>

      {/* Blocked dates */}
      <div className="card">
        <div className="p-5 border-b border-sand-100">
          <h2 className="font-semibold text-charcoal text-sm flex items-center gap-2">
            <CalendarOff size={15} className="text-terracotta" />
            封禁日期
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <input
              type="date"
              className="input-field text-xs py-2 w-36"
              value={blockForm.date}
              onChange={e => setBlockForm({ ...blockForm, date: e.target.value })}
            />
            <input
              className="input-field text-xs py-2 flex-1 min-w-32"
              placeholder="封禁原因（可选）"
              value={blockForm.reason}
              onChange={e => setBlockForm({ ...blockForm, reason: e.target.value })}
            />
            <button onClick={addBlock} disabled={saving} className="btn-primary text-xs px-4 py-2 gap-1.5 disabled:opacity-50">
              <Plus size={13} />
              添加
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {blocked.map(({ date, reason }) => (
              <div key={date} className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs">
                <CalendarOff size={12} className="text-red-400" />
                <span className="font-medium text-red-700">{date}</span>
                {reason && <span className="text-red-500">· {reason}</span>}
                <button
                  onClick={() => removeBlock(date)}
                  disabled={saving}
                  className="ml-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                >×</button>
              </div>
            ))}
            {blocked.length === 0 && (
              <p className="text-xs text-charcoal-light">暂无封禁日期</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
