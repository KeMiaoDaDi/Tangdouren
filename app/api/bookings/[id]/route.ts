import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// GET /api/bookings/[id] — 查询单条预约状态（公开，仅返回有限字段）
// 供支付结果页轮询，确认 webhook 是否已处理
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: '缺少预约 ID' }, { status: 400 })

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('bookings')
      .select('booking_id, status, booking_date, start_time, end_time, assigned_table_code, assigned_table_type, deposit_amount, currency')
      .eq('booking_id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: '预约不存在' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/bookings/:id]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// PATCH /api/bookings/[id] — 更新预约状态（需管理员登录）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id }     = await params
    const { status } = await request.json()

    const allowed = ['payment_pending', 'payment_failed', 'expired', 'confirmed', 'completed', 'cancelled', 'refund_pending', 'refunded', 'partially_refunded']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: '无效的状态值' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('bookings')
      .update({ status })
      .eq('booking_id', id)
      .select('booking_id, status')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/bookings/:id]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
