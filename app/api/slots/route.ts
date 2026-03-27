import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/slots?year=2026&month=3
// 返回指定月份所有活跃 slot 及各自剩余容量
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year  = searchParams.get('year')
  const month = searchParams.get('month') // 1-based

  if (!year || !month) {
    return NextResponse.json({ error: '缺少 year / month 参数' }, { status: 400 })
  }

  const y  = parseInt(year)
  const m  = parseInt(month)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`

  try {
    // slots 和 blocked_dates 用普通客户端，bookings 需要 admin 客户端（anon 无 SELECT 权限）
    const supabase = await createClient()
    const admin    = createAdminClient()

    // 1. 获取该月所有活跃 slot
    const { data: slots, error: slotsErr } = await supabase
      .from('slot_templates')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .eq('is_active', true)
      .order('date')
      .order('start_time')

    if (slotsErr) throw slotsErr

    // 2. 获取该月所有未取消的预约（用 admin 客户端绕过 RLS）
    const { data: bookings, error: bookingsErr } = await admin
      .from('bookings')
      .select('slot_id, party_size')
      .in('slot_id', (slots ?? []).map(s => s.id))
      .neq('status', 'cancelled')

    if (bookingsErr) throw bookingsErr

    // 3. 计算每个 slot 的已预约人数
    const bookedMap: Record<string, number> = {}
    ;(bookings ?? []).forEach(b => {
      bookedMap[b.slot_id] = (bookedMap[b.slot_id] ?? 0) + b.party_size
    })

    // 4. 获取封禁日期
    const { data: blocked } = await supabase
      .from('blocked_dates')
      .select('date')
      .gte('date', from)
      .lte('date', to)

    const result = (slots ?? []).map(slot => ({
      id:         slot.id,
      date:       slot.date,
      startTime:  slot.start_time,
      endTime:    slot.end_time,
      label:      slot.label,
      capacity:   slot.capacity,
      booked:     bookedMap[slot.id] ?? 0,
      projectType: slot.project_type,
    }))

    return NextResponse.json({
      slots:        result,
      blockedDates: (blocked ?? []).map(b => b.date),
    })
  } catch (err) {
    console.error('[GET /api/slots]', err)
    return NextResponse.json({ error: '服务器错误，请稍后再试' }, { status: 500 })
  }
}

// POST /api/slots — 新建 slot（需管理员登录）
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const body = await request.json()
    const { date, start_time, end_time, label, capacity, project_type } = body

    if (!date || !start_time || !end_time || !capacity) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('slot_templates')
      .insert({ date, start_time, end_time, label, capacity, project_type: project_type ?? [] })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该日期同一时间段已存在' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[POST /api/slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
