'use client'

// 会员首页：同页展示进度、奖励、到店记录，不拆成二级入口。
// 原「我的奖励」与「奖励记录」是同一份数据的两个视图（后者是前者的超集），合并成一块。

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarCheck, Gift, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import MemberProgressBar from '@/components/member/MemberProgressBar'
import { forgetMember, readRememberedMember } from '@/lib/member/client'
import type { MemberDashboard, MemberRewardEntry, MemberVisitEntry } from '@/lib/member/service'
import type { RewardType } from '@/lib/member/member'

const copy = {
  zh: {
    title:        '糖豆人会员页',
    hi:           (name: string) => `你好，${name}`,
    loading:      '正在读取会员信息…',
    startAsMember:'以会员身份开始计时',
    myRewards:    '我的奖励',
    recentVisits: '最近到店',
    viewAll:      '查看全部',
    collapse:     '收起',
    noRewards:    '还没有解锁奖励，计满 3 次就能拿到第一张 9 折。',
    noVisits:     '还没有可显示的到店记录。',
    notMember:    '这台设备上没有记住会员身份。',
    backToTimer:  '回到首页',
    switchAccount:'切换账户',
    rewardNames: {
      P10_OFF: '9折',
      P20_OFF: '8折',
      P30_OFF: '7折',
      P50_OFF: '5折',
    } as Record<RewardType, string>,
    states: {
      available: '可用',
      used:      '已使用',
    },
    progressCounted: '计入进度',
    progressPaused:  '未计入进度',
    usedReward:      (name: string) => `使用了${name}`,
    noRewardUsed:    '未使用会员优惠',
    unlockedOn:      (d: string) => `${d} 解锁`,
    usedOn:          (d: string) => `${d} 使用`,
  },
  en: {
    title:        'Tangdouren Membership',
    hi:           (name: string) => `Hi ${name}`,
    loading:      'Loading your membership…',
    startAsMember:'Start as Member',
    myRewards:    'My Rewards',
    recentVisits: 'Recent Visits',
    viewAll:      'View all',
    collapse:     'Show less',
    noRewards:    'No rewards yet — three visits unlock your first 10% off.',
    noVisits:     'No visits to show yet.',
    notMember:    'This device does not remember a membership.',
    backToTimer:  'Back to home',
    switchAccount:'Use another account',
    rewardNames: {
      P10_OFF: '10% off',
      P20_OFF: '20% off',
      P30_OFF: '30% off',
      P50_OFF: '50% off',
    } as Record<RewardType, string>,
    states: {
      available: 'Available',
      used:      'Used',
    },
    progressCounted: 'Counted',
    progressPaused:  'Not counted',
    usedReward:      (name: string) => `Used ${name}`,
    noRewardUsed:    'No member discount',
    unlockedOn:      (d: string) => `Unlocked ${d}`,
    usedOn:          (d: string) => `Used ${d}`,
  },
} as const

function dateOf(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

export default function ClubPage() {
  const router = useRouter()
  const { lang, toggle } = useLanguage()
  const c = copy[lang]

  const [dashboard, setDashboard] = useState<MemberDashboard | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showAllVisits, setShowAllVisits] = useState(false)
  const [showAllRewards, setShowAllRewards] = useState(false)

  const load = useCallback(async () => {
    const remembered = readRememberedMember()
    if (!remembered) { setLoading(false); return }

    try {
      const res = await fetch('/api/member/dashboard', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: remembered.email, visitLimit: 50 }),
      })
      const data = await res.json().catch(() => ({})) as { dashboard?: MemberDashboard; error?: string }
      if (!res.ok || !data.dashboard) { setError(data.error ?? c.loading); return }
      setDashboard(data.dashboard)
    } catch {
      setError(c.loading)
    } finally {
      setLoading(false)
    }
  }, [c.loading])

  useEffect(() => { void load() }, [load])

  function switchAccount() {
    forgetMember()
    router.push('/self-timer')
  }

  const memberName = dashboard?.member.display_name ?? ''

  /** 奖励行右侧的状态。现在只有「可用 / 已使用」两种。 */
  const rewardBadge = (entry: MemberRewardEntry): { text: string; tone: string } => ({
    text: c.states[entry.state],
    tone: entry.state === 'available' ? 'text-sage' : 'text-charcoal-light',
  })
  const visitRows   = dashboard?.visit_history ?? []
  const rewardRows  = dashboard?.rewards ?? []

  // 英文版暂不开放会员制度（业主 2026-09-17）：英文界面只给一句提示与切回中文的按钮。
  // 会员页本身是中文优先的页面，数据与接口都没变，中文界面照旧。
  if (lang !== 'zh') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream-100 via-orange-50 to-rose-50 px-4 pb-24 pt-24">
        <div className="mx-auto max-w-md space-y-4">
          <div className="card space-y-4 p-6 text-center">
            <h1 className="font-display text-xl font-semibold text-charcoal">Tangdouren Membership</h1>
            <p className="text-sm leading-6 text-charcoal-light">
              The membership programme is currently available in Chinese only. Switch the site to
              Chinese to join or view your rewards.
            </p>
            <button className="btn-primary w-full" onClick={toggle}>Switch to Chinese</button>
            <button className="btn-ghost w-full text-sm" onClick={() => router.push('/self-timer')}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-100 via-orange-50 to-rose-50 px-4 pb-24 pt-24">
      <div className="mx-auto max-w-md space-y-4">
        <button onClick={() => router.push('/self-timer')} className="btn-ghost text-sm">
          <ArrowLeft size={14} /> {c.backToTimer}
        </button>

        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-terracotta shadow-sm">
            <Sparkles size={12} /> {c.title}
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold text-charcoal">
            {memberName ? c.hi(memberName) : c.title}
          </h1>
          {dashboard && <p className="mt-1 text-xs text-charcoal-light">{dashboard.member.email_masked}</p>}
        </div>

        {loading && <div className="card p-5 text-center text-sm text-charcoal-light">{c.loading}</div>}

        {!loading && !dashboard && (
          <div className="card space-y-3 p-5">
            <p className="text-sm text-charcoal-light">{c.notMember}</p>
            <button className="btn-primary w-full" onClick={() => router.push('/self-timer')}>{c.backToTimer}</button>
          </div>
        )}

        {dashboard && (
          <>
            <MemberProgressBar
              cells={dashboard.progress_cells}
              cycleProgress={dashboard.cycle_progress}
              nextReward={dashboard.next_reward}
              lifetimeVisits={dashboard.lifetime_visits}
              lang={lang}
              expandable
            />

            <button className="btn-primary w-full py-3.5 text-base" onClick={() => router.push('/self-timer')}>
              {c.startAsMember}
            </button>

            {/* ── My Rewards ─────────────────────────────────────────────── */}
            <div className="card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Gift size={16} className="text-terracotta" />
                <h2 className="font-display text-lg font-semibold text-charcoal">{c.myRewards}</h2>
              </div>
              {rewardRows.length === 0 && <p className="text-sm text-charcoal-light">{c.noRewards}</p>}
              <ul className="space-y-2">
                {(showAllRewards ? rewardRows : rewardRows.slice(0, 5)).map((entry: MemberRewardEntry) => {
                  const badge = rewardBadge(entry)
                  return (
                    <li key={entry.reward.reward_id} className="rounded-2xl border border-sand-100 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-charcoal">{c.rewardNames[entry.reward.reward_type]}</span>
                        <span className={`text-xs ${badge.tone}`}>{badge.text}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-charcoal-light">
                        {c.unlockedOn(dateOf(entry.reward.unlocked_at))}
                        {entry.reward.used_at && ` · ${c.usedOn(dateOf(entry.reward.used_at))}`}
                      </p>
                    </li>
                  )
                })}
              </ul>
              {rewardRows.length > 5 && (
                <button className="btn-ghost w-full text-sm" onClick={() => setShowAllRewards(v => !v)}>
                  {showAllRewards ? c.collapse : c.viewAll}
                </button>
              )}
            </div>

            {/* ── Recent Visits ──────────────────────────────────────────── */}
            <div className="card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <CalendarCheck size={16} className="text-terracotta" />
                <h2 className="font-display text-lg font-semibold text-charcoal">{c.recentVisits}</h2>
              </div>
              {visitRows.length === 0 && <p className="text-sm text-charcoal-light">{c.noVisits}</p>}
              <ul className="space-y-2">
                {(showAllVisits ? visitRows : visitRows.slice(0, 5)).map((visit: MemberVisitEntry) => (
                  <li key={visit.session_id} className="rounded-2xl border border-sand-100 bg-white px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-charcoal">{visit.visit_date}</span>
                      <span className={`text-xs ${visit.counted_for_progress ? 'text-sage' : 'text-charcoal-light'}`}>
                        {visit.progress_paused ? c.progressPaused : c.progressCounted}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-charcoal-light">
                      {visit.used_reward
                        ? c.usedReward(c.rewardNames[visit.used_reward])
                        : c.noRewardUsed}
                    </p>
                  </li>
                ))}
              </ul>
              {visitRows.length > 5 && (
                <button className="btn-ghost w-full text-sm" onClick={() => setShowAllVisits(v => !v)}>
                  {showAllVisits ? c.collapse : c.viewAll}
                </button>
              )}
            </div>

          </>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {dashboard && (
          <button className="btn-ghost w-full text-xs text-charcoal-light" onClick={switchAccount}>
            {c.switchAccount}
          </button>
        )}
      </div>
    </div>
  )
}
