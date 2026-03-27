import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const BookingSchema = z.object({
  slotId:       z.string().uuid('无效的时段 ID'),
  customerName: z.string().min(1, '请填写姓名').max(50),
  contact:      z.string().min(1, '请填写联系方式').max(100),
  contactType:  z.enum(['wechat', 'phone'], { message: '联系方式类型错误' }),
  partySize:    z.number().int().min(1).max(10),
  note:         z.string().max(500).optional(),
})

// POST /api/bookings — 提交新预约（含容量检查）
export async function POST(request: NextRequest) {
  try {
    const body   = await request.json()
    const parsed = BookingSchema.safeParse(body)

    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '请求参数有误'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { slotId, customerName, contact, contactType, partySize, note } = parsed.data
    const supabase = await createClient()

    // 使用数据库函数原子检查容量并插入（利用触发器兜底）
    // 先查 slot 是否存在且活跃
    const { data: slot, error: slotErr } = await supabase
      .from('slot_templates')
      .select('id, capacity, is_active, date')
      .eq('id', slotId)
      .eq('is_active', true)
      .single()

    if (slotErr || !slot) {
      return NextResponse.json({ error: '该时段不存在或已停用' }, { status: 404 })
    }

    // 查当前已预约人数（乐观检查，触发器会做最终保障）
    const { data: existing } = await supabase
      .from('bookings')
      .select('party_size')
      .eq('slot_id', slotId)
      .neq('status', 'cancelled')

    const bookedCount = (existing ?? []).reduce((sum, b) => sum + b.party_size, 0)

    if (bookedCount + partySize > slot.capacity) {
      return NextResponse.json({ error: '该时段剩余名额不足，请选择其他时段' }, { status: 409 })
    }

    // 检查同一联系方式是否已预约同一 slot
    const { data: duplicate } = await supabase
      .from('bookings')
      .select('id')
      .eq('slot_id', slotId)
      .eq('contact', contact)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (duplicate) {
      return NextResponse.json({ error: '您已预约该时段，请勿重复提交' }, { status: 409 })
    }

    // 写入预约记录（数据库触发器会再次校验容量）
    const { data: booking, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        slot_id:       slotId,
        customer_name: customerName,
        contact,
        contact_type:  contactType,
        party_size:    partySize,
        note:          note ?? null,
        status:        'confirmed',
      })
      .select('id, status, created_at')
      .single()

    if (insertErr) {
      const msg = insertErr.message ?? ''
      if (msg.includes('slot_full')) {
        return NextResponse.json({ error: '提交时该时段已满，请选择其他时段' }, { status: 409 })
      }
      // 唯一索引冲突（同一联系方式已预约同一 slot）
      if (insertErr.code === '23505') {
        return NextResponse.json({ error: '您已预约该时段，请勿重复提交' }, { status: 409 })
      }
      throw insertErr
    }

    return NextResponse.json({
      bookingId: booking.id,
      status:    booking.status,
      message:   '预约成功！我们将在 24 小时内确认您的预约。',
    }, { status: 201 })

  } catch (err: unknown) {
    const detail = err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
    console.error('[POST /api/bookings]', detail)
    return NextResponse.json({ error: '服务器错误，请稍后再试' }, { status: 500 })
  }
}

// GET /api/bookings — 后台查询预约列表（需登录）
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const date   = searchParams.get('date')

    let query = supabase
      .from('bookings')
      .select(`
        id, customer_name, contact, contact_type,
        party_size, note, status, created_at,
        slot_templates ( date, start_time, end_time, label )
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)
    if (date) {
      // 通过关联表过滤日期
      query = query.eq('slot_templates.date', date)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/bookings]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
