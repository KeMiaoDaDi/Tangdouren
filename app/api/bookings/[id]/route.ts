import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/bookings/[id] — 更新预约状态（需管理员登录）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id }     = await params
    const { status } = await request.json()

    const allowed = ['pending', 'confirmed', 'cancelled', 'completed']
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
