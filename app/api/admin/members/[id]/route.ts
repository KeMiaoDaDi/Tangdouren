import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  findMemberById,
  getMemberDashboard,
  linkSessionToMember,
  mapMemberError,
  setMemberActive,
  updateMemberName,
} from '@/lib/member/service'
import { londonDateOf } from '@/lib/member/member'

// ── 后台会员详情与操作 ────────────────────────────────────────────────────────
// 允许：挂订单、停用/恢复会员、改姓名。
// 禁止：手动加减 Visit、直接改 Reward Progress、改邮箱、删历史。

type Action =
  | 'disable'
  | 'enable'
  | 'update_name'
  | 'link_session'

interface PatchBody {
  action:       Action
  is_active?:   boolean
  display_name?: string
  session_id?:  string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id }  = await params
  const admin   = createAdminClient()

  try {
    const member = await findMemberById(admin, id)
    if (!member) return NextResponse.json({ error: mapMemberError('MEMBER_NOT_FOUND') }, { status: 404 })

    const dashboard = await getMemberDashboard(admin, id, {
      visitLimit:  50,
      londonToday: londonDateOf(new Date()),
    })

    return NextResponse.json({ member, dashboard })
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    console.error('[GET /api/admin/members/[id]]', code)
    return NextResponse.json({ error: mapMemberError(code) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id } = await params
  const body   = await request.json() as PatchBody
  const admin  = createAdminClient()

  const allowed: Action[] = ['disable', 'enable', 'update_name', 'link_session']
  if (!allowed.includes(body.action)) {
    return NextResponse.json({ error: '无效操作' }, { status: 400 })
  }

  try {
    const member = await findMemberById(admin, id)
    if (!member) return NextResponse.json({ error: mapMemberError('MEMBER_NOT_FOUND') }, { status: 404 })

    if (body.action === 'disable' || body.action === 'enable') {
      const result = await setMemberActive(admin, id, body.action === 'enable')
      if (!result.ok) return NextResponse.json({ error: mapMemberError(result.error) }, { status: 409 })
      return NextResponse.json({ success: true, is_active: body.action === 'enable' })
    }

    if (body.action === 'update_name') {
      const result = await updateMemberName(admin, id, body.display_name ?? '')
      if (!result.ok) return NextResponse.json({ error: mapMemberError(result.error) }, { status: 409 })
      return NextResponse.json({ success: true })
    }

    if (body.action === 'link_session') {
      if (!body.session_id) return NextResponse.json({ error: '缺少订单号' }, { status: 400 })
      const result = await linkSessionToMember(admin, body.session_id, id)
      if (!result.ok) return NextResponse.json({ error: mapMemberError(result.error) }, { status: 409 })
      return NextResponse.json({ success: true })
    }

  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    console.error('[PATCH /api/admin/members/[id]]', code)
    return NextResponse.json({ error: mapMemberError(code) }, { status: 500 })
  }
}
