import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/slots/[id] — 修改或停用 slot
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id } = await params
    const body   = await request.json()

    const { data, error } = await supabase
      .from('slot_templates')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// DELETE /api/slots/[id] — 删除 slot（有预约时拒绝）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id } = await params

    // 检查是否有未取消的预约
    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('slot_id', id)
      .neq('status', 'cancelled')

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: '该时段存在有效预约，请先处理后再删除' }, { status: 409 })
    }

    const { error } = await supabase.from('slot_templates').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/slots]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
