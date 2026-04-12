import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'gallery'

// ── GET /api/gallery — 公开获取图库列表 ──────────────────────────────────────

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('gallery_items')
      .select('id, storage_path, alt_text, category, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at',  { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/gallery]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// ── POST /api/gallery — 管理员上传图片 ───────────────────────────────────────
// Content-Type: multipart/form-data
// Fields: file (File), alt_text (string?), category (string?)

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const formData = await request.formData()
    const file     = formData.get('file') as File | null
    const altText  = (formData.get('alt_text')  as string | null) ?? ''
    const category = (formData.get('category')  as string | null) ?? '其他'

    if (!file || file.size === 0) {
      return NextResponse.json({ error: '请选择要上传的图片' }, { status: 400 })
    }

    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const allowed  = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: '仅支持 JPG、PNG、WebP、GIF 格式' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '图片大小不得超过 5MB' }, { status: 400 })
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const bytes    = await file.arrayBuffer()
    const buffer   = new Uint8Array(bytes)

    const admin = createAdminClient()

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[gallery upload]', uploadError)
      return NextResponse.json({ error: '图片上传失败，请重试' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage
      .from(BUCKET)
      .getPublicUrl(filename)

    // 取当前最大 sort_order + 1
    const { data: maxRow } = await admin
      .from('gallery_items')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextOrder = ((maxRow?.sort_order ?? -1) as number) + 1

    const { data: item, error: dbError } = await admin
      .from('gallery_items')
      .insert({
        storage_path: publicUrl,
        alt_text:     altText || null,
        category,
        sort_order:   nextOrder,
      })
      .select()
      .single()

    if (dbError) {
      // 清理已上传的文件
      await admin.storage.from(BUCKET).remove([filename])
      throw dbError
    }

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('[POST /api/gallery]', err)
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 })
  }
}
