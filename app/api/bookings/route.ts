import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createBooking, BookingError } from '@/lib/booking/bookingService'
import { BUSINESS_CONFIG as cfg } from '@/lib/booking/config'

// ── POST /api/bookings — 提交新预约 ───────────────────────────────────────────

const BookingSchema = z.object({
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式错误'),
  partySize:       z.number().int().min(1).max(4),
  acceptsSharing:  z.boolean(),
  startTime:       z.string().regex(/^\d{2}:\d{2}$/, '开始时间格式错误'),
  durationMinutes: z.number().int()
    .min(cfg.minDurationMinutes)
    .max(cfg.maxDurationMinutes)
    .refine(d => (d - cfg.minDurationMinutes) % cfg.durationStepMinutes === 0, '时长必须按30分钟递增'),
  customerName:    z.string().min(1, '请填写姓名').max(50),
  email:           z.string().email('请输入有效的邮箱地址').max(100),
  remark:          z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json()
    const parsed = BookingSchema.safeParse(body)

    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '请求参数有误'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const supabase = createAdminClient()
    const result   = await createBooking(parsed.data, supabase)

    return NextResponse.json(result, { status: 201 })

  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/bookings]', detail)
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 })
  }
}

// ── GET /api/bookings — 后台预约列表（需登录） ────────────────────────────────

// confirmed 预约超过结束时间 2 小时后自动标记为 completed
async function autoCompleteExpired(admin: ReturnType<typeof createAdminClient>) {
  try {
    // 伦敦当前时间（用于比较）
    const londonNow = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date()).replace(' ', 'T')

    // 取所有 confirmed 预约（只取需要的字段）
    const { data: confirmed } = await admin
      .from('bookings')
      .select('booking_id, booking_date, end_time')
      .eq('status', 'confirmed')

    if (!confirmed || confirmed.length === 0) return

    const toComplete: string[] = []
    for (const b of confirmed) {
      // 拼成完整时间字符串并加 2 小时
      const endStr = `${b.booking_date}T${b.end_time.slice(0, 5)}:00`
      const endMs  = new Date(endStr).getTime() + 2 * 60 * 60 * 1000
      if (new Date(londonNow).getTime() >= endMs) {
        toComplete.push(b.booking_id)
      }
    }

    if (toComplete.length === 0) return

    await admin
      .from('bookings')
      .update({ status: 'completed' })
      .in('booking_id', toComplete)
  } catch (e) {
    console.error('[autoCompleteExpired]', e)
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const adminSb = createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const date   = searchParams.get('date')

    let query = adminSb
      .from('bookings')
      .select(`
        booking_id, booking_date, customer_name, email,
        party_size, accepts_sharing, start_time, end_time,
        assigned_table_code, assigned_table_type,
        booking_mode, seat_group_type,
        status, remark, created_at, deposit_amount
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)
    if (date)                        query = query.eq('booking_date', date)

    const { data, error } = await query
    if (error) throw error

    // 惰性自动完成：confirmed 且 end_time + 2小时 < 当前伦敦时间 → 转为 completed
    void autoCompleteExpired(adminSb)

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/bookings]', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
