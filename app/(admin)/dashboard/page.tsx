export const dynamic = 'force-dynamic'

import { CalendarDays, Users, CheckCircle2, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const statusLabel: Record<string, { label: string; cls: string }> = {
  confirmed: { label: '已确认', cls: 'badge-confirmed' },
  cancelled:  { label: '已取消', cls: 'badge-cancelled' },
  completed:  { label: '已完成', cls: 'badge-completed' },
}

/** 伦敦当前日期字符串 "YYYY-MM-DD" */
function londonToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date())
}

/** 伦敦当前月份首日 / 末日 */
function londonMonthRange() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const last = new Date(Number(y), Number(m), 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = londonToday()
  const { from: monthFrom, to: monthTo } = londonMonthRange()

  // ── 今日预约数 ──────────────────────────────────────────────────────────────
  const { count: todayCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('slot_templates.date', today)
    .neq('status', 'cancelled')

  // ── 今日时段 ────────────────────────────────────────────────────────────────
  const { data: todaySlots } = await supabase
    .from('slot_templates')
    .select(`
      id, label, start_time, end_time, capacity,
      bookings ( party_size, status )
    `)
    .eq('date', today)
    .eq('is_active', true)
    .order('start_time')

  // ── 本月已完成数 ────────────────────────────────────────────────────────────
  const { count: completedCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('slot_templates.date', monthFrom)
    .lte('slot_templates.date', monthTo)

  // ── 本月参与总人数 ──────────────────────────────────────────────────────────
  const { data: partySums } = await supabase
    .from('bookings')
    .select('party_size, slot_templates!inner(date)')
    .neq('status', 'cancelled')
    .gte('slot_templates.date', monthFrom)
    .lte('slot_templates.date', monthTo)

  const totalPeople = (partySums ?? []).reduce((s, b) => s + (b.party_size ?? 0), 0)

  // ── 最近 5 条预约 ────────────────────────────────────────────────────────────
  const { data: recent } = await supabase
    .from('bookings')
    .select(`
      id, customer_name, contact, contact_type,
      party_size, status, created_at,
      slot_templates ( date, start_time, end_time, label )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  // ── 整理今日时段数据 ──────────────────────────────────────────────────────
  const slotsForToday = (todaySlots ?? []).map(slot => {
    const booked = (slot.bookings ?? [])
      .filter((b: { status: string }) => b.status !== 'cancelled')
      .reduce((s: number, b: { party_size: number }) => s + b.party_size, 0)
    return { ...slot, booked }
  })

  const stats = [
    { label: '今日预约',    value: String(todayCount ?? 0),   sub: today,          icon: CalendarDays, color: 'bg-terracotta/10 text-terracotta' },
    { label: '本月已完成',  value: String(completedCount ?? 0), sub: '场次',          icon: CheckCircle2, color: 'bg-sage/10 text-sage-dark' },
    { label: '本月参与人数', value: String(totalPeople),        sub: '人次（未取消）', icon: Users,        color: 'bg-blue-100 text-blue-600' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">概览</h1>
        <p className="text-sm text-charcoal-light mt-0.5">
          拼豆工作室后台 · 英国时间 {today}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${color} mb-3`}>
              <Icon size={18} />
            </div>
            <div className="font-display text-3xl font-bold text-charcoal">{value}</div>
            <div className="text-xs font-medium text-charcoal mt-0.5">{label}</div>
            <div className="text-xs text-charcoal-light mt-1 flex items-center gap-1">
              <TrendingUp size={10} />{sub}
            </div>
          </div>
        ))}
      </div>

      {/* Today's slots */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal text-sm">今日时段概览</h2>
          <Link href="/dashboard/slots" className="text-xs text-terracotta hover:underline">配置 Slot →</Link>
        </div>
        {slotsForToday.length === 0 ? (
          <p className="text-sm text-charcoal-light py-4 text-center">今日暂无排班 Slot</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {slotsForToday.map(slot => (
              <div key={slot.id} className="shrink-0 rounded-xl border border-sand-200 bg-warm-50 p-3 w-36 text-center">
                <div className="text-xs text-charcoal-light mb-0.5">{slot.start_time}–{slot.end_time}</div>
                <div className="font-semibold text-sm text-charcoal">{slot.label}</div>
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-sand-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-terracotta transition-all"
                      style={{ width: `${Math.min((slot.booked / slot.capacity) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-xs text-charcoal-light mt-1">
                  {slot.booked}/{slot.capacity} 位
                  {slot.booked >= slot.capacity && <span className="ml-1 text-red-500">满</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent bookings */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-sand-100">
          <h2 className="font-semibold text-charcoal text-sm">最近预约</h2>
          <Link href="/dashboard/bookings" className="text-xs text-terracotta hover:underline">查看全部 →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-warm-50 text-xs text-charcoal-light">
                <th className="text-left px-5 py-3 font-medium">姓名</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">日期 · 时段</th>
                <th className="text-left px-5 py-3 font-medium">人数</th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {(recent ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-charcoal-light text-sm">暂无预约记录</td>
                </tr>
              )}
              {(recent ?? []).map(b => {
                const st   = statusLabel[b.status] ?? { label: b.status, cls: '' }
                const slot = (b.slot_templates as unknown) as { date: string; start_time: string; end_time: string; label: string } | null
                return (
                  <tr key={b.id} className="hover:bg-warm-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-charcoal">{b.customer_name}</div>
                      <div className="text-xs text-charcoal-light">
                        {b.contact_type === 'wechat' ? '微信' : '手机'}: {b.contact}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-charcoal-light">
                      {slot ? `${slot.date} · ${slot.label} ${slot.start_time}–${slot.end_time}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-charcoal">{b.party_size} 人</td>
                    <td className="px-5 py-3.5">
                      <span className={st.cls}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
