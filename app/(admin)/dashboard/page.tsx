export const dynamic = 'force-dynamic'

import { CalendarDays, Users, CheckCircle2, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

const statusLabel: Record<string, { label: string; cls: string }> = {
  confirmed: { label: '已确认', cls: 'badge-confirmed' },
  cancelled: { label: '已取消', cls: 'badge-cancelled' },
  completed: { label: '已完成', cls: 'badge-completed' },
}

const tableTypeLabel: Record<string, string> = {
  single: '单人桌', double: '双人桌', four: '四人桌',
}

function londonToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date())
}

function londonMonthRange() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const y    = parts.find(p => p.type === 'year')!.value
  const m    = parts.find(p => p.type === 'month')!.value
  const last = new Date(Number(y), Number(m), 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` }
}

export default async function DashboardPage() {
  const supabase = createAdminClient()
  const today    = londonToday()
  const { from: monthFrom, to: monthTo } = londonMonthRange()

  // 今日预约数
  const { count: todayCount } = await supabase
    .from('bookings')
    .select('booking_id', { count: 'exact', head: true })
    .eq('booking_date', today)
    .neq('status', 'cancelled')

  // 今日时段概览（各桌预约情况）
  const { data: todayBookings } = await supabase
    .from('bookings')
    .select('assigned_table_code, assigned_table_type, start_time, end_time, party_size, booking_mode, status')
    .eq('booking_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  // 本月已完成数
  const { count: completedCount } = await supabase
    .from('bookings')
    .select('booking_id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('booking_date', monthFrom)
    .lte('booking_date', monthTo)

  // 本月参与总人数
  const { data: partySums } = await supabase
    .from('bookings')
    .select('party_size')
    .neq('status', 'cancelled')
    .gte('booking_date', monthFrom)
    .lte('booking_date', monthTo)

  const totalPeople = (partySums ?? []).reduce((s, b) => s + (b.party_size ?? 0), 0)

  // 最近 5 条预约
  const { data: recent } = await supabase
    .from('bookings')
    .select('booking_id, customer_name, email, party_size, accepts_sharing, booking_date, start_time, end_time, assigned_table_code, assigned_table_type, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const stats = [
    { label: '今日预约',    value: String(todayCount ?? 0),    sub: today,           icon: CalendarDays, color: 'bg-terracotta/10 text-terracotta' },
    { label: '本月已完成',  value: String(completedCount ?? 0), sub: '场次',          icon: CheckCircle2, color: 'bg-sage/10 text-sage-dark' },
    { label: '本月参与人数', value: String(totalPeople),         sub: '人次（未取消）', icon: Users,        color: 'bg-blue-100 text-blue-600' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">概览</h1>
        <p className="text-sm text-charcoal-light mt-0.5">拼豆工作室后台 · 英国时间 {today}</p>
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

      {/* 今日预约概览 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal text-sm">今日预约列表</h2>
          <Link href="/dashboard/bookings" className="text-xs text-terracotta hover:underline">查看全部 →</Link>
        </div>
        {!todayBookings || todayBookings.length === 0 ? (
          <p className="text-sm text-charcoal-light py-4 text-center">今日暂无预约</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-charcoal-light border-b border-sand-100">
                  <th className="text-left py-2 font-medium">时段</th>
                  <th className="text-left py-2 font-medium">桌号</th>
                  <th className="text-left py-2 font-medium">人数</th>
                  <th className="text-left py-2 font-medium">方式</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-50">
                {todayBookings.map((b, i) => (
                  <tr key={i} className="text-charcoal">
                    <td className="py-2">{b.start_time}–{b.end_time}</td>
                    <td className="py-2 font-medium">{b.assigned_table_code}</td>
                    <td className="py-2">{b.party_size} 人</td>
                    <td className="py-2 text-charcoal-light">{b.booking_mode === 'shared_partial_table' ? '拼桌' : '整桌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 最近预约 */}
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
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell">桌位</th>
                <th className="text-left px-5 py-3 font-medium">人数</th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {(recent ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-charcoal-light text-sm">暂无预约记录</td></tr>
              )}
              {(recent ?? []).map(b => {
                const st = statusLabel[b.status] ?? { label: b.status, cls: '' }
                return (
                  <tr key={b.booking_id} className="hover:bg-warm-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-charcoal">{b.customer_name}</div>
                      <div className="text-xs text-charcoal-light">{b.email}</div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-charcoal-light">
                      {b.booking_date} · {b.start_time}–{b.end_time}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-charcoal">
                      {b.assigned_table_code} · {tableTypeLabel[b.assigned_table_type] ?? b.assigned_table_type}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-charcoal">{b.party_size} 人</td>
                    <td className="px-5 py-3.5"><span className={st.cls}>{st.label}</span></td>
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
