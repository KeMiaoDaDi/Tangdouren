import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'gallery'

// ── DELETE /api/gallery/[id] — 管理员删除图片 ────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id } = await params
    const admin   = createAdminClient()

    // 先取出 storage_path（公开 URL），提取文件名
    const { data: item, error: fetchError } = await admin
      .from('gallery_items')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!item) return NextResponse.json({ error: '图片不存在' }, { status: 404 })

    // 从 URL 中提取 bucket 内的文件名
    // publicUrl 形如 https://*.supabase.co/storage/v1/object/public/gallery/xxx.jpg
    const filename = item.storage_path.split(`/storage/v1/object/public/${BUCKET}/`)[1]
    if (filename) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([filename])
      if (removeError) console.warn('[gallery delete storage]', removeError.message)
    }

    const { error: dbError } = await admin
      .from('gallery_items')
      .delete()
      .eq('id', id)

    if (dbError) throw dbError

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/gallery/:id]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// ── PATCH /api/gallery/[id] — 管理员更新图片信息 ─────────────────────────────
// Body: { alt_text?: string; category?: string; sort_order?: number }

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const { id }   = await params
    const body     = await request.json()
    const update: Record<string, unknown> = {}

    if ('alt_text'   in body) update.alt_text   = body.alt_text ?? null
    if ('category'   in body) update.category   = body.category
    if ('sort_order' in body) update.sort_order = Number(body.sort_order)

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '无有效更新字段' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('gallery_items')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/gallery/:id]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
