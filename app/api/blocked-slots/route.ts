import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface BlockedSlot {
  id:         string
  date:       string
  start_time: string
  end_time:   string
  reason:     string | null
  created_at: string
}

// GET /api/blocked-slots?date=YYYY-MM-DD  (公开，供可用性接口调用)
// GET /api/blocked-slots?from=YYYY-MM-DD&to=YYYY-MM-DD  (管理员，列表页)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  try {
    const supabase = createAdminClient()
    let query = supabase
      .from('blocked_time_slots')
      .select('id, date, start_time, end_time, reason, created_at')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (date) {
      query = query.eq('date', date)
    } else if (from && to) {
      query = query.gte('date', from).lte('date', to)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/blocked-slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// POST /api/blocked-slots — 新增封禁时段（管理员）
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { date, start_time, end_time, reason } = await request.json()
    if (!date || !start_time || !end_time) {
      return NextResponse.json({ error: '缺少必填字段 date/start_time/end_time' }, { status: 400 })
    }
    if (start_time >= end_time) {
      return NextResponse.json({ error: '结束时间必须晚于开始时间' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('blocked_time_slots')
      .insert({ date, start_time, end_time, reason: reason || null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[POST /api/blocked-slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// DELETE /api/blocked-slots?id=UUID — 删除封禁时段（管理员）
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin.from('blocked_time_slots').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/blocked-slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
