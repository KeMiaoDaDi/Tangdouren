'use client'

// 后台会员详情（PRD 16）：能挂订单、停用；
// 不能手动加减 Visit、不能直接改折扣进度、不能改邮箱、不能删历史。
// 折扣在结算时由服务端按到店次数自动计算，后台只展示记录。

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Link2 } from 'lucide-react'
import Sidebar from '@/components/admin/Sidebar'
import MemberProgressBar from '@/components/member/MemberProgressBar'
import type { MemberDashboard } from '@/lib/member/service'
import type { RewardType } from '@/lib/member/member'

interface MemberRow {
  member_id:    string
  email:        string
  display_name: string | null
  joined_at:    string
  is_active:    boolean
}

const rewardLabels: Record<RewardType, string> = {
  P10_OFF: '9折',
  P20_OFF: '8折',
  P30_OFF: '7折',
  P50_OFF: '5折',
}

export default function MemberDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [member, setMember]       = useState<MemberRow | null>(null)
  const [dashboard, setDashboard] = useState<MemberDashboard | null>(null)
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState('')
  const [error, setError]         = useState('')
  const [notice, setNotice]       = useState('')
  const [nameEdit, setNameEdit]   = useState('')
  const [sessionId, setSessionId] = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/members/${id}`)
      const data = await res.json() as { member?: MemberRow; dashboard?: MemberDashboard; error?: string }
      if (!res.ok || !data.member) { setError(data.error ?? '找不到该会员'); return }
      setMember(data.member)
      setDashboard(data.dashboard ?? null)
      setNameEdit(data.member.display_name ?? '')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function act(action: string, payload: Record<string, unknown>, key: string) {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const res  = await fetch(`/api/admin/members/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, ...payload }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? '操作失败'); return false }
      await load()
      return true
    } catch {
      setError('网络错误，请重试')
      return false
    } finally {
      setBusy('')
    }
  }

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Europe/London' }) : '—'

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar active="/dashboard/members" />
      <div className="md:ml-56 pt-14 md:pt-0">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
          <button onClick={() => router.push('/dashboard/members')} className="text-sm text-stone-500 hover:text-stone-700 flex items-center gap-1">
            <ArrowLeft size={14} /> 返回会员列表
          </button>

          {loading && <div className="text-center py-12 text-stone-400">加载中…</div>}
          {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
          {notice && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{notice}</p>}

          {member && (
            <>
              {/* ── 身份 ─────────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-bold text-stone-800">{member.display_name ?? '（未填姓名）'}</h1>
                    <p className="text-sm text-stone-500">{member.email}</p>
                    <p className="text-xs text-stone-400 mt-1">加入于 {fmt(member.joined_at)}</p>
                  </div>
                  <button
                    onClick={() => act(member.is_active ? 'disable' : 'enable', {}, 'active')}
                    disabled={busy === 'active'}
                    className={member.is_active
                      ? 'px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100 transition shrink-0'
                      : 'px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition shrink-0'}
                  >
                    {busy === 'active' ? '处理中…' : member.is_active ? '停用会员' : '恢复会员'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={nameEdit}
                    onChange={e => setNameEdit(e.target.value)}
                    placeholder="会员姓名"
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  />
                  <button
                    onClick={async () => { if (await act('update_name', { display_name: nameEdit }, 'name')) setNotice('姓名已更新') }}
                    disabled={busy === 'name'}
                    className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition shrink-0"
                  >
                    {busy === 'name' ? '保存中…' : '保存姓名'}
                  </button>
                </div>
                <p className="text-xs text-stone-400">邮箱不提供修改（PRD 2.2）。姓名由会员自己也能改。</p>
              </div>

              {/* ── 进度 ─────────────────────────────────────────────── */}
              {dashboard && (
                <MemberProgressBar
                  cells={dashboard.progress_cells}
                  cycleProgress={dashboard.cycle_progress}
                  nextReward={dashboard.next_reward}
                  lifetimeVisits={dashboard.lifetime_visits}
                  lang="zh"
                />
              )}

              {/* ── 挂订单 ───────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 space-y-3">
                <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2"><Link2 size={15} /> 把订单关联到该会员</h2>
                <p className="text-xs text-stone-400">
                  顾客开始计时时忘了以会员身份登录时用。只能挂**尚未结算**的订单；已经结算的要先撤销结算，否则等于绕过结算台账改数字。
                </p>
                <div className="flex gap-2">
                  <input
                    value={sessionId}
                    onChange={e => setSessionId(e.target.value)}
                    placeholder="计时订单号，如 PB-20260916-001"
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  />
                  <button
                    onClick={async () => {
                      const ok = await act('link_session', { session_id: sessionId.trim() }, 'link')
                      if (ok) { setNotice('订单已关联到该会员'); setSessionId('') }
                    }}
                    disabled={busy === 'link' || !sessionId.trim()}
                    className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition shrink-0"
                  >
                    {busy === 'link' ? '关联中…' : '关联'}
                  </button>
                </div>
              </div>

              {/* ── 到店记录 ─────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 space-y-3">
                <h2 className="text-sm font-semibold text-stone-700">到店记录</h2>
                <ul className="space-y-1.5">
                  {(dashboard?.visit_history ?? []).map(v => (
                    <li key={v.session_id} className="flex items-center justify-between text-sm border border-stone-100 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-700">{v.visit_date}</span>
                        {v.used_reward && <span className="text-terracotta text-xs">本次享 {rewardLabels[v.used_reward]}</span>}
                      </div>
                      <span className={v.counted_for_progress ? 'text-emerald-600 text-xs' : 'text-amber-600 text-xs'}>
                        {v.progress_paused ? '未计入进度（后台补挂）' : '计入进度'}
                      </span>
                    </li>
                  ))}
                  {(dashboard?.visit_history ?? []).length === 0 && <li className="text-sm text-stone-400">还没有已结算的到店记录。</li>}
                </ul>
              </div>

              {/* ── 禁止动作 ─────────────────────────────────────────── */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">后台不能做的事</p>
                <p className="text-xs leading-5 text-amber-700">
                  手动加减到店次数、直接改折扣进度、修改邮箱、删除到店历史。
                  会员进度必须来自真实结算记录；折扣在结算时由服务端按到店次数自动计算，后台改不了数字。
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
