import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/blocked-dates?year=2026&month=3
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year  = searchParams.get('year')
  const month = searchParams.get('month')

  if (!year || !month) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  }

  const y    = parseInt(year)
  const m    = parseInt(month)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('blocked_dates')
      .select('date, reason')
      .gte('date', from)
      .lte('date', to)

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/blocked-dates]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// POST /api/blocked-dates — 新增封禁日期（管理员）
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { date, reason } = await request.json()
    if (!date) return NextResponse.json({ error: '缺少日期' }, { status: 400 })

    const { data, error } = await supabase
      .from('blocked_dates')
      .upsert({ date, reason: reason ?? null }, { onConflict: 'date' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[POST /api/blocked-dates]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// DELETE /api/blocked-dates?date=2026-04-01 — 移除封禁（管理员）
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    if (!date) return NextResponse.json({ error: '缺少日期参数' }, { status: 400 })

    const { error } = await supabase.from('blocked_dates').delete().eq('date', date)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/blocked-dates]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
