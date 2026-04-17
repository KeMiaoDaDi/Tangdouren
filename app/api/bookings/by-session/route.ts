// GET /api/bookings/by-session?session_id=xxx
// 通过 Stripe Checkout Session ID 查询预约状态
// 供支付成功页轮询使用

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: '缺少 session_id' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('bookings')
      .select('booking_id, status, booking_date, start_time, end_time, assigned_table_code')
      .eq('checkout_session_id', sessionId)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '预约不存在' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/bookings/by-session]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
