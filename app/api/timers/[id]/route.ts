// GET /api/timers/[id]  — 公开端点，顾客页面轮询用
// 只返回顾客需要的字段，不暴露管理员信息
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin  = createAdminClient()

  const { data, error } = await admin
    .from('timer_sessions')
    .select(
      'session_id, customer_name, status, started_at, paused_at, total_paused_ms, stopped_at, elapsed_minutes, billing_minutes, amount_gbp, amount_cny, exchange_rate, bill_breakdown'
    )
    .eq('session_id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '计时订单不存在' }, { status: 404 })
  }

  return NextResponse.json({ session: data }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
