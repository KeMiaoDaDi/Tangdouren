import { NextRequest, NextResponse } from 'next/server'
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

    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/bookings]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
