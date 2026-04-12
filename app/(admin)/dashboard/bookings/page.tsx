'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Booking {
  booking_id:          string
  booking_date:        string
  customer_name:       string
  phone:               string
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
  confirmed: { label: '已确认', cls: 'badge-confirmed' },
  cancelled: { label: '已取消', cls: 'badge-cancelled' },
  completed: { label: '已完成', cls: 'badge-completed' },
}

const tableTypeLabel: Record<string, string> = {
  single: '单人桌', double: '双人桌', four: '四人桌',
}

const TABS = ['全部', '已确认', '已完成', '已取消']
const TAB_STATUS: Record<string, string> = {
  '全部': 'all', '已确认': 'confirmed', '已完成': 'completed', '已取消': 'cancelled',
}

export default function BookingsPage() {
  const [tab,      setTab]      = useState('全部')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (TAB_STATUS[tab] !== 'all') params.set('status', TAB_STATUS[tab])
      const res  = await fetch(`/api/bookings?${params}`)
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const filtered = bookings.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      b.customer_name.toLowerCase().includes(q) ||
      b.phone.toLowerCase().includes(q) ||
      b.booking_date.includes(q)
    )
  })

  const detail = bookings.find(b => b.booking_id === selected)

  async function updateStatus(id: string, status: string) {
    setSaving(true)
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchBookings()
      if (selected === id) setSelected(null)
    } finally { setSaving(false) }
  }

  function exportCSV() {
    const headers = ['姓名', '手机号', '日期', '开始', '结束', '时长(分)', '桌号', '桌型', '人数', '拼桌', '状态', '备注', '提交时间']
    const rows = filtered.map(b => {
      const durMin = b.end_time && b.start_time
        ? (parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]))
          - (parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]))
        : ''
      return [
        b.customer_name,
        b.phone,
        b.booking_date,
        b.start_time,
        b.end_time,
        String(durMin),
        b.assigned_table_code,
        tableTypeLabel[b.assigned_table_type] ?? b.assigned_table_type,
        String(b.party_size),
        b.accepts_sharing ? '是' : '否',
        statusMeta[b.status]?.label ?? b.status,
        b.remark ?? '',
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">预约管理</h1>
          <p className="text-sm text-charcoal-light mt-0.5">共 {bookings.length} 条记录</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchBookings} className="btn-secondary text-sm gap-1.5" disabled={loading}>
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
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setSelected(null) }}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all',
                  tab === t ? 'bg-terracotta text-white' : 'bg-warm-100 text-charcoal-light hover:bg-sand-200'
                )}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
            <input className="input-field pl-8 py-2 text-xs w-48"
              placeholder="搜索姓名 / 手机号…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={cn('grid gap-5', detail ? 'lg:grid-cols-5' : 'grid-cols-1')}>
        {/* 列表 */}
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
                        onClick={() => setSelected(selected === b.booking_id ? null : b.booking_id)}
                      >
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
                        <td className="px-4 py-3.5">
                          <span className={st.cls}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                          {b.status === 'confirmed' && (
                            <div className="flex items-center justify-end gap-1">
                              <button disabled={saving}
                                onClick={() => updateStatus(b.booking_id, 'completed')}
                                className="rounded-lg bg-sage/10 px-2.5 py-1 text-xs text-sage-dark hover:bg-sage/20 font-medium disabled:opacity-50">
                                ✓ 完成
                              </button>
                              <button disabled={saving}
                                onClick={() => updateStatus(b.booking_id, 'cancelled')}
                                className="rounded-lg bg-red-50 px-2.5 py-1 text-xs text-red-500 hover:bg-red-100 font-medium disabled:opacity-50">
                                ✕ 取消
                              </button>
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

        {/* 详情面板 */}
        {detail && (
          <div className="lg:col-span-2 card p-5 animate-fade-in h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-charcoal">预约详情</h3>
              <button onClick={() => setSelected(null)} className="text-charcoal-light hover:text-charcoal text-lg leading-none">×</button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { label: '编号',   value: detail.booking_id.slice(0, 8) + '…' },
                { label: '姓名',   value: detail.customer_name },
                { label: '手机',   value: detail.phone },
                { label: '日期',   value: detail.booking_date },
                { label: '时段',   value: `${detail.start_time}–${detail.end_time}` },
                { label: '桌位',   value: `${detail.assigned_table_code}（${tableTypeLabel[detail.assigned_table_type] ?? detail.assigned_table_type}）` },
                { label: '人数',   value: `${detail.party_size} 人${detail.accepts_sharing ? '（接受拼桌）' : ''}` },
                { label: '拼桌',   value: detail.booking_mode === 'shared_partial_table' ? '是' : '否' },
                { label: '备注',   value: detail.remark || '无' },
                { label: '提交',   value: new Date(detail.created_at).toLocaleString('zh-CN') },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <span className="text-charcoal-light w-10 shrink-0">{label}</span>
                  <span className="text-charcoal break-all">{value}</span>
                </div>
              ))}
            </div>

            {detail.status === 'confirmed' && (
              <div className="mt-5 pt-4 border-t border-sand-100 flex gap-2">
                <button disabled={saving}
                  onClick={() => updateStatus(detail.booking_id, 'completed')}
                  className="flex-1 rounded-xl bg-sage/10 py-2 text-sm text-sage-dark font-medium hover:bg-sage/20 transition-colors disabled:opacity-50">
                  标记为已完成
                </button>
                <button disabled={saving}
                  onClick={() => updateStatus(detail.booking_id, 'cancelled')}
                  className="flex-1 rounded-xl bg-red-50 py-2 text-sm text-red-500 font-medium hover:bg-red-100 transition-colors disabled:opacity-50">
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
