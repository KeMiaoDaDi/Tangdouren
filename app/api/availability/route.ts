import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailability, mapDbRowToExisting } from '@/lib/booking/availabilityService'
import type { AvailabilityResponse } from '@/lib/booking/types'

/**
 * GET /api/availability
 * 查询指定日期、人数下的可预约时段组合
 *
 * 参数：
 *   date          必填  "YYYY-MM-DD"
 *   partySize     必填  1 | 2 | 3（3代表3-4人）
 *   acceptsSharing 必填 "true" | "false"
 *   startTime     选填  "HH:MM"
 *   durationMinutes 选填  数字
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date            = searchParams.get('date')
  const partySizeStr    = searchParams.get('partySize')
  const acceptsSharing  = searchParams.get('acceptsSharing') === 'true'
  const startTimeFilter = searchParams.get('startTime') ?? null
  const durationFilter  = searchParams.get('durationMinutes')
    ? parseInt(searchParams.get('durationMinutes')!)
    : null

  if (!date || !partySizeStr) {
    return NextResponse.json({ error: '缺少必填参数 date / partySize' }, { status: 400 })
  }

  const partySize = parseInt(partySizeStr)
  if (![1, 2, 3].includes(partySize)) {
    return NextResponse.json({ error: 'partySize 必须为 1、2 或 3' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // 检查日期是否被封禁
    const { data: blocked } = await supabase
      .from('blocked_dates')
      .select('date')
      .eq('date', date)
      .maybeSingle()

    if (blocked) {
      const resp: AvailabilityResponse = {
        date, partySize, acceptsSharing,
        startTimeFilter, durationFilter,
        results: [],
      }
      return NextResponse.json(resp)
    }

    // 加载当日所有非取消预约
    const { data: rows, error } = await supabase
      .from('bookings')
      .select(`
        booking_id, booking_date, start_time, end_time, buffered_end_time,
        party_size, accepts_sharing,
        assigned_table_id, assigned_table_code, assigned_table_type,
        booking_mode, seat_group_type, status
      `)
      .eq('booking_date', date)
      .neq('status', 'cancelled')

    if (error) throw error

    const allBookings = (rows ?? []).map(mapDbRowToExisting)

    const results = getAvailability({
      partySize,
      acceptsSharing,
      allBookings,
      startTimeFilter,
      durationFilter,
    })

    const resp: AvailabilityResponse = {
      date, partySize, acceptsSharing,
      startTimeFilter, durationFilter,
      results,
    }
    return NextResponse.json(resp)

  } catch (err) {
    console.error('[GET /api/availability]', err)
    return NextResponse.json({ error: '服务器错误，请稍后再试' }, { status: 500 })
  }
}
