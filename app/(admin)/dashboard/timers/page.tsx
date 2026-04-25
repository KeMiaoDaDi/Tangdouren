'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatHMS } from '@/lib/timer/pricing'
import Sidebar from '@/components/admin/Sidebar'

interface TimerSession {
  session_id:      string
  customer_name:   string
  status:          'idle' | 'running' | 'paused' | 'completed'
  started_at:      string
  stopped_at:      string | null
  elapsed_minutes: number | null
  amount_gbp:      number | null
  booking_id:      string | null
}

function calcLiveElapsed(s: TimerSession): number {
  if (s.status === 'completed' && s.elapsed_minutes !== null) return s.elapsed_minutes * 60
  return Math.max(0, (Date.now() - new Date(s.started_at).getTime()) / 1000)
}

const statusMeta: Record<string, { label: string; color: string }> = {
  idle:      { label: '未开始',   color: 'bg-stone-100 text-stone-500' },
  running:   { label: '计时中',   color: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: '已暂停',   color: 'bg-amber-100 text-amber-700' },
  completed: { label: '已完成',   color: 'bg-stone-100 text-stone-500' },
}

export default function TimersListPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<TimerSession[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all' | 'idle' | 'running' | 'paused' | 'completed'>('all')
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({ customerName: '' })

  async function load() {
    const res  = await fetch(`/api/admin/timers?status=${filter}`)
    const data = await res.json() as { sessions: TimerSession[] }
    setSessions(data.sessions ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createTimer() {
    if (!form.customerName.trim()) { alert('请填写顾客姓名'); return }
    setCreating(true)
    const res  = await fetch('/api/admin/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: form.customerName }),
    })
    const data = await res.json() as { session?: { session_id: string }; error?: string }
    if (!res.ok) { alert(data.error ?? '创建失败'); setCreating(false); return }
    router.push(`/dashboard/timers/${data.session!.session_id}`)
  }

  const active   = sessions.filter(s => s.status !== 'completed')
  const finished = sessions.filter(s => s.status === 'completed')

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar active="/dashboard/timers" />
      <div className="md:ml-56 pt-14 md:pt-0">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-stone-800">拼豆计时</h1>
            <span className="text-xs text-stone-400">{active.length} 个进行中</span>
          </div>

          {/* 快速创建 */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4">
            <p className="text-sm font-medium text-stone-700 mb-3">新建独立计时订单</p>
            <div className="flex gap-2">
              <input
                value={form.customerName}
                onChange={e => setForm({ customerName: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && createTimer()}
                placeholder="顾客姓名"
                className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30"
              />
              <button
                onClick={createTimer}
                disabled={creating}
                className="px-4 py-2 bg-terracotta text-white rounded-xl text-sm font-medium hover:bg-terracotta/90 disabled:opacity-50 transition"
              >
                {creating ? '创建中…' : '⏱ 开始计时'}
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-2">* 也可在预约管理页找到具体预约后点击「计时」按钮</p>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {(['all', 'idle', 'running', 'paused', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${filter === f ? 'bg-terracotta text-white' : 'bg-white text-stone-500 border border-stone-200 hover:border-terracotta/40'}`}
              >
                {{ all: '全部', idle: '未开始', running: '计时中', paused: '已暂停', completed: '已完成' }[f]}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-12 text-stone-400">加载中…</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <p className="text-3xl mb-2">⏱</p>
              <p>暂无计时订单</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => {
                const meta      = statusMeta[s.status]
                const liveElapsed = s.status !== 'completed' ? calcLiveElapsed(s) : (s.elapsed_minutes ?? 0) * 60
                return (
                  <button
                    key={s.session_id}
                    onClick={() => router.push(`/dashboard/timers/${s.session_id}`)}
                    className="w-full bg-white rounded-2xl border border-stone-100 px-4 py-3 flex items-center justify-between hover:border-terracotta/30 hover:shadow-sm transition text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-stone-800 text-sm">{s.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400">{s.session_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-base font-semibold text-stone-700">
                        {formatHMS(liveElapsed)}
                      </p>
                      {s.status === 'completed' && s.amount_gbp != null && (
                        <p className="text-xs font-bold text-terracotta">£{s.amount_gbp.toFixed(2)}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
