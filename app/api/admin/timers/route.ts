// POST /api/admin/timers  — 创建计时订单
// GET  /api/admin/timers  — 获取计时订单列表（管理员）
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// 生成 PB-YYYYMMDD-NNN 格式的 session_id（使用伦敦本地日期）
async function generateSessionId(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const london = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const dateStr = london.replace(/-/g, '')       // YYYYMMDD
  const prefix  = `PB-${dateStr}-`

  const { count } = await admin
    .from('timer_sessions')
    .select('*', { count: 'exact', head: true })
    .like('session_id', `${prefix}%`)

  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return `${prefix}${seq}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  let body: { bookingId?: string; customerName?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const { bookingId, customerName } = body

  if (!customerName?.trim() && !bookingId) {
    return NextResponse.json({ error: '请填写顾客姓名或关联预约' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 如果关联了预约，获取顾客姓名
  let resolvedName = customerName?.trim() ?? ''
  if (bookingId && !resolvedName) {
    const { data: booking } = await admin
      .from('bookings')
      .select('customer_name')
      .eq('booking_id', bookingId)
      .single()
    resolvedName = booking?.customer_name ?? ''
  }

  const sessionId = await generateSessionId(admin)
  const now       = new Date().toISOString()

  const { data, error } = await admin
    .from('timer_sessions')
    .insert({
      session_id:    sessionId,
      booking_id:    bookingId ?? null,
      customer_name: resolvedName,
      status:        'running',
      started_at:    now,
      created_by:    user.email ?? user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/admin/timers]', error)
    return NextResponse.json({ error: '创建失败，请稍后重试' }, { status: 500 })
  }

  return NextResponse.json({ session: data }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')  // running | paused | completed | all

  const admin = createAdminClient()
  let query = admin
    .from('timer_sessions')
    .select('*, bookings(booking_date, start_time, end_time)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessions: data })
}
