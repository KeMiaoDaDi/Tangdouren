'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, RefreshCw, CalendarDays, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TABLE_DEFINITIONS } from '@/lib/booking/config'

interface Booking {
  booking_id:          string
  booking_date:        string
  customer_name:       string
  email:               string
  party_size:          number
  accepts_sharing:     boolean
  start_time:          string
  end_time:            string
  assigned_table_code: string
  assigned_table_type: string
  booking_mode:        string
  seat_group_type:     string
  status:              string
  remark:              string | null
  created_at:          string
}

const statusMeta: Record<string, { label: string; cls: string }> = {
  confirmed:          { label: '已确认',  cls: 'badge-confirmed' },
  cancelled:          { label: '已取消',  cls: 'badge-cancelled' },
  completed:          { label: '已完成',  cls: 'badge-completed' },
  payment_pending:    { label: '待支付',  cls: 'badge-pending' },
  expired:            { label: '已过期',  cls: 'badge-expired' },
  payment_failed:     { label: '支付失败', cls: 'badge-expired' },
  refund_pending:     { label: '退款中',  cls: 'badge-pending' },
  refunded:           { label: '已退款',  cls: 'badge-cancelled' },
  partially_refunded: { label: '部分退款', cls: 'badge-cancelled' },
}

const tableTypeLabel: Record<string, string> = {
  single: '单人桌', double: '双人桌', four: '四人桌',
}

const TABLE_CODES = TABLE_DEFINITIONS.map(t => t.tableCode)

// 伦敦今日
function londonToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date())
}

// 时长（分钟）
function durationMin(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

// ── 列表视图 ──────────────────────────────────────────────────────────────────
const TABS_STATUS = ['全部', '已确认', '已完成', '已取消']
const TAB_STATUS_MAP: Record<string, string> = {
  '全部': 'all', '已确认': 'confirmed', '已完成': 'completed', '已取消': 'cancelled',
}

function ListView() {
  const [tab,      setTab]      = useState('全部')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (TAB_STATUS_MAP[tab] !== 'all') params.set('status', TAB_STATUS_MAP[tab])
      const res  = await fetch(`/api/bookings?${params}`)
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { fetch_() }, [fetch_])

  const filtered = bookings.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return b.customer_name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q) || b.booking_date.includes(q)
  })

  const detail = bookings.find(b => b.booking_id === selected)

  async function updateStatus(id: string, status: string) {
    setSaving(true)
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetch_()
      if (selected === id) setSelected(null)
    } finally { setSaving(false) }
  }

  function exportCSV() {
    const headers = ['姓名','邮箱','日期','开始','结束','时长(分)','桌号','桌型','人数','拼桌','状态','备注','提交时间']
    const rows = filtered.map(b => {
      const dur = b.end_time && b.start_time ? String(durationMin(b.start_time, b.end_time)) : ''
      return [
        b.customer_name, b.email, b.booking_date, b.start_time, b.end_time, dur,
        b.assigned_table_code, tableTypeLabel[b.assigned_table_type] ?? b.assigned_table_type,
        String(b.party_size), b.accepts_sharing ? '是' : '否',
        statusMeta[b.status]?.label ?? b.status, b.remark ?? '',
        new Date(b.created_at).toLocaleString('zh-CN'),
      ]
    })
    const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `bookings-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-charcoal-light">共 {bookings.length} 条记录</p>
        <div className="flex gap-2">
          <button onClick={fetch_} className="btn-secondary text-sm gap-1.5" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button onClick={exportCSV} className="btn-secondary text-sm gap-1.5">
            <Download size={14} /> 导出 CSV
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {TABS_STATUS.map(t => (
              <button key={t} onClick={() => { setTab(t); setSelected(null) }}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all',
                  tab === t ? 'bg-terracotta text-white' : 'bg-warm-100 text-charcoal-light hover:bg-sand-200')}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
            <input className="input-field pl-8 py-2 text-xs w-48"
              placeholder="搜索姓名 / 手机号…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className={cn('grid gap-5', detail ? 'lg:grid-cols-5' : 'grid-cols-1')}>
        <div className={cn('card overflow-hidden', detail ? 'lg:col-span-3' : '')}>
          {loading ? (
            <div className="py-16 text-center text-sm text-charcoal-light">加载中…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50 text-xs text-charcoal-light border-b border-sand-100">
                    <th className="text-left px-4 py-3 font-medium">姓名</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">日期 · 时段</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">桌位</th>
                    <th className="text-left px-4 py-3 font-medium">状态</th>
                    <th className="text-right px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {filtered.map(b => {
                    const st = statusMeta[b.status] ?? { label: b.status, cls: '' }
                    return (
                      <tr key={b.booking_id}
                        className={cn('hover:bg-warm-50 transition-colors cursor-pointer', selected === b.booking_id && 'bg-terracotta/5')}
                        onClick={() => setSelected(selected === b.booking_id ? null : b.booking_id)}>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-charcoal">{b.customer_name}</div>
                          <div className="text-xs text-charcoal-light">{b.party_size} 人{b.accepts_sharing ? ' · 拼桌' : ''}</div>
                        </td>
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          <div className="text-xs text-charcoal-light">{b.booking_date}</div>
                          <div className="text-xs text-charcoal">{b.start_time}–{b.end_time}</div>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <div className="text-xs font-medium text-charcoal">{b.assigned_table_code}</div>
                          <div className="text-xs text-charcoal-light">{tableTypeLabel[b.assigned_table_type] ?? b.assigned_table_type}</div>
                        </td>
                        <td className="px-4 py-3.5"><span className={st.cls}>{st.label}</span></td>
                        <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                          {b.status === 'confirmed' && (
                            <div className="flex items-center justify-end gap-1">
                              <button disabled={saving} onClick={() => updateStatus(b.booking_id, 'completed')}
                                className="rounded-lg bg-sage/10 px-2.5 py-1 text-xs text-sage-dark hover:bg-sage/20 font-medium disabled:opacity-50">✓ 完成</button>
                              <button disabled={saving} onClick={() => updateStatus(b.booking_id, 'cancelled')}
                                className="rounded-lg bg-red-50 px-2.5 py-1 text-xs text-red-500 hover:bg-red-100 font-medium disabled:opacity-50">✕ 取消</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-10 text-charcoal-light text-sm">暂无匹配记录</div>
              )}
            </div>
          )}
        </div>

        {detail && (
          <div className="lg:col-span-2 card p-5 animate-fade-in h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-charcoal">预约详情</h3>
              <button onClick={() => setSelected(null)} className="text-charcoal-light hover:text-charcoal text-lg leading-none">×</button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { label: '编号', value: detail.booking_id.slice(0,8) + '…' },
                { label: '姓名', value: detail.customer_name },
                { label: '邮箱', value: detail.email },
                { label: '日期', value: detail.booking_date },
                { label: '时段', value: `${detail.start_time}–${detail.end_time}` },
                { label: '桌位', value: `${detail.assigned_table_code}（${tableTypeLabel[detail.assigned_table_type] ?? detail.assigned_table_type}）` },
                { label: '人数', value: `${detail.party_size} 人${detail.accepts_sharing ? '（拼桌）' : ''}` },
                { label: '备注', value: detail.remark || '无' },
                { label: '提交', value: new Date(detail.created_at).toLocaleString('zh-CN') },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <span className="text-charcoal-light w-10 shrink-0">{label}</span>
                  <span className="text-charcoal break-all">{value}</span>
                </div>
              ))}
            </div>
            {detail.status === 'confirmed' && (
              <div className="mt-5 pt-4 border-t border-sand-100 flex gap-2">
                <button disabled={saving} onClick={() => updateStatus(detail.booking_id, 'completed')}
                  className="flex-1 rounded-xl bg-sage/10 py-2 text-sm text-sage-dark font-medium hover:bg-sage/20 disabled:opacity-50">
                  标记为已完成
                </button>
                <button disabled={saving} onClick={() => updateStatus(detail.booking_id, 'cancelled')}
                  className="flex-1 rounded-xl bg-red-50 py-2 text-sm text-red-500 font-medium hover:bg-red-100 disabled:opacity-50">
                  取消预约
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 日程视图 ──────────────────────────────────────────────────────────────────
const OPEN_MIN  = 11 * 60   // 11:00
const CLOSE_MIN = 21 * 60   // 21:00
const TOTAL_MIN = CLOSE_MIN - OPEN_MIN  // 600 分钟

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function ScheduleView() {
  const [date,       setDate]       = useState(londonToday())
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [bookings,   setBookings]   = useState<Booking[]>([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)

  const loadDay = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/bookings?date=${d}`)
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  async function updateStatus(id: string, status: string) {
    setSaving(true)
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await loadDay(date)
    } finally { setSaving(false) }
  }

  // 时间轴刻度（每小时一条）
  const hourTicks = Array.from({ length: 11 }, (_, i) => 11 + i)  // 11~21

  // 显示的桌位列表
  const visibleTables = tableFilter === 'all'
    ? TABLE_CODES
    : [tableFilter]

  // 按桌位分组预约（仅已确认/已完成）
  const ACTIVE_STATUSES = ['confirmed', 'completed']
  const bookingsByTable: Record<string, Booking[]> = {}
  for (const t of visibleTables) bookingsByTable[t] = []
  for (const b of bookings) {
    if (!ACTIVE_STATUSES.includes(b.status)) continue
    if (bookingsByTable[b.assigned_table_code]) {
      bookingsByTable[b.assigned_table_code].push(b)
    }
  }

  // 颜色方案
  const bookingColor = (b: Booking) => {
    if (b.booking_mode === 'shared_partial_table') return 'bg-sage/20 border-sage/50 text-sage-dark'
    return 'bg-terracotta/15 border-terracotta/40 text-terracotta'
  }

  return (
    <div className="space-y-5">
      {/* 筛选栏 */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-charcoal-light block mb-1">日期</label>
          <input type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="input-field py-2 text-sm w-40" />
        </div>
        <div>
          <label className="text-xs text-charcoal-light block mb-1">桌号</label>
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)}
            className="input-field py-2 text-sm w-36">
            <option value="all">全部桌位</option>
            <optgroup label="单人桌">
              {TABLE_DEFINITIONS.filter(t => t.tableType === 'single').map(t => (
                <option key={t.tableCode} value={t.tableCode}>{t.tableCode}</option>
              ))}
            </optgroup>
            <optgroup label="双人桌">
              {TABLE_DEFINITIONS.filter(t => t.tableType === 'double').map(t => (
                <option key={t.tableCode} value={t.tableCode}>{t.tableCode}</option>
              ))}
            </optgroup>
            <optgroup label="四人桌">
              {TABLE_DEFINITIONS.filter(t => t.tableType === 'four').map(t => (
                <option key={t.tableCode} value={t.tableCode}>{t.tableCode}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <button onClick={() => loadDay(date)} disabled={loading}
          className="btn-secondary text-sm gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-charcoal-light">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-terracotta/20 border border-terracotta/40" />整桌
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-sage/20 border border-sage/50" />拼桌
          </span>
        </div>
      </div>

      {loading ? (
        <div className="card py-16 text-center text-sm text-charcoal-light">加载中…</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${visibleTables.length * 100 + 60}px` }}>

              {/* 时间轴表头 */}
              <div className="relative border-b border-sand-100 bg-warm-50">
                {/* 桌位列标题 */}
                <div className="flex">
                  <div className="w-14 shrink-0" />
                  {visibleTables.map(code => {
                    const def = TABLE_DEFINITIONS.find(t => t.tableCode === code)
                    return (
                      <div key={code} className="flex-1 min-w-[90px] text-center py-2.5 border-l border-sand-100">
                        <div className="text-xs font-semibold text-charcoal">{code}</div>
                        <div className="text-[10px] text-charcoal-light">{tableTypeLabel[def?.tableType ?? ''] ?? ''}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 时间轴主体 */}
              <div className="relative flex">
                {/* 小时刻度列 */}
                <div className="w-14 shrink-0 relative" style={{ height: `${TOTAL_MIN * 1.2}px` }}>
                  {hourTicks.map(h => (
                    <div key={h}
                      className="absolute right-2 text-[10px] text-charcoal-light/70 leading-none"
                      style={{ top: `${(h * 60 - OPEN_MIN) * 1.2}px`, transform: 'translateY(-50%)' }}>
                      {String(h).padStart(2,'0')}:00
                    </div>
                  ))}
                  {/* 水平刻度线（延伸到整行） */}
                  {hourTicks.map(h => (
                    <div key={`line-${h}`}
                      className="absolute left-0 right-0 border-t border-sand-100"
                      style={{ top: `${(h * 60 - OPEN_MIN) * 1.2}px`, width: `${visibleTables.length * 100 + 60}vw` }} />
                  ))}
                </div>

                {/* 每桌时间轴 */}
                {visibleTables.map(code => (
                  <div key={code} className="flex-1 min-w-[90px] relative border-l border-sand-100"
                    style={{ height: `${TOTAL_MIN * 1.2}px` }}>
                    {(bookingsByTable[code] ?? []).map(b => {
                      const startPx = (timeToMin(b.start_time) - OPEN_MIN) * 1.2
                      const dur     = durationMin(b.start_time, b.end_time)
                      const height  = Math.max(dur * 1.2, 24)
                      return (
                        <div key={b.booking_id}
                          className={cn(
                            'absolute inset-x-1 rounded-lg border px-1.5 py-1 overflow-hidden cursor-default group',
                            bookingColor(b)
                          )}
                          style={{ top: `${startPx}px`, height: `${height}px` }}
                          title={`${b.customer_name}｜${b.start_time}–${b.end_time}｜${b.party_size}人`}
                        >
                          <div className="text-[10px] font-semibold leading-tight truncate">{b.customer_name}</div>
                          <div className="text-[9px] leading-tight opacity-70">{b.start_time}–{b.end_time}</div>
                          <div className="text-[9px] leading-tight opacity-70">{b.party_size}人</div>

                          {/* 悬停操作 */}
                          {b.status === 'confirmed' && (
                            <div className="absolute inset-x-1 bottom-1 hidden group-hover:flex gap-1">
                              <button disabled={saving}
                                onClick={() => updateStatus(b.booking_id, 'completed')}
                                className="flex-1 rounded bg-white/70 text-[9px] text-sage-dark hover:bg-white font-medium py-0.5 disabled:opacity-50">
                                ✓
                              </button>
                              <button disabled={saving}
                                onClick={() => updateStatus(b.booking_id, 'cancelled')}
                                className="flex-1 rounded bg-white/70 text-[9px] text-red-500 hover:bg-white font-medium py-0.5 disabled:opacity-50">
                                ✕
              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 当日统计 */}
          {bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length > 0 && (
            <div className="border-t border-sand-100 px-5 py-3 flex flex-wrap gap-4 text-xs text-charcoal-light bg-warm-50">
              <span>当日预约：<strong className="text-charcoal">{bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length}</strong> 单</span>
              <span>总人数：<strong className="text-charcoal">{bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).reduce((s,b) => s + b.party_size, 0)}</strong> 人</span>
              <span>已完成：<strong className="text-charcoal">{bookings.filter(b => b.status === 'completed').length}</strong> 单</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 主页面（双 Tab） ──────────────────────────────────────────────────────────
type ViewTab = 'list' | 'schedule'

export default function BookingsPage() {
  const [viewTab, setViewTab] = useState<ViewTab>('list')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">预约管理</h1>
        </div>
        {/* 视图切换 */}
        <div className="flex rounded-xl border border-sand-200 overflow-hidden text-sm">
          <button onClick={() => setViewTab('list')}
            className={cn('flex items-center gap-1.5 px-4 py-2 transition-colors',
              viewTab === 'list' ? 'bg-terracotta text-white' : 'text-charcoal-light hover:bg-warm-50')}>
            <List size={14} /> 列表
          </button>
          <button onClick={() => setViewTab('schedule')}
            className={cn('flex items-center gap-1.5 px-4 py-2 transition-colors border-l border-sand-200',
              viewTab === 'schedule' ? 'bg-terracotta text-white' : 'text-charcoal-light hover:bg-warm-50')}>
            <CalendarDays size={14} /> 日程
          </button>
        </div>
      </div>

      {viewTab === 'list'     && <ListView />}
      {viewTab === 'schedule' && <ScheduleView />}
    </div>
  )
}
