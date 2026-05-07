import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailability, mapDbRowToExisting } from '@/lib/booking/availabilityService'
import type { AvailabilityResponse } from '@/lib/booking/types'

/** 伦敦当前时间（分钟数，如 14:30 → 870） */
function londonNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(new Date())
  const h = parseInt(parts.find(p => p.type === 'hour')!.value)
  const m = parseInt(parts.find(p => p.type === 'minute')!.value)
  return h * 60 + m
}

/** 伦敦今日日期字符串 "YYYY-MM-DD" */
function londonToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date())
}

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

    // 检查日期是否被整天封禁
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

    // 加载该日封禁时段（部分时间封禁）
    const { data: blockedSlots } = await supabase
      .from('blocked_time_slots')
      .select('start_time, end_time')
      .eq('date', date)

    const timeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const blockedRanges = (blockedSlots ?? []).map(s => ({
      start: timeToMins(s.start_time),
      end:   timeToMins(s.end_time),
    }))

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

    let results = getAvailability({
      partySize,
      acceptsSharing,
      allBookings,
      startTimeFilter,
      durationFilter,
    })

    // ── 过滤被时段封禁覆盖的选项 ────────────────────────────────────────────
    if (blockedRanges.length > 0) {
      results = results
        .map(r => {
          const startMins = timeToMins(r.startTime)
          const filteredOptions = r.options.filter(opt => {
            const endMins = startMins + opt.durationMinutes
            // 该选项时间范围与任意封禁区间有重叠则排除
            return !blockedRanges.some(b => startMins < b.end && endMins > b.start)
          })
          return { ...r, options: filteredOptions }
        })
        .filter(r => r.options.length > 0)
    }

    // ── 今日：过滤已过去的时段 + 当天特殊限制 ──────────────────────────────
    if (date === londonToday()) {
      const cutoff = londonNowMinutes() + 60  // 至少 1 小时后才可预约
      results = results.filter(r => {
        const [h, m] = r.startTime.split(':').map(Number)
        const startMins = h * 60 + m
        // 当天 11:00–12:00 时段不允许当日预约（开始时间 < 12:00 均排除）
        if (startMins < 12 * 60) return false
        // 必须在当前时间 1 小时后
        return startMins > cutoff
      })
    }

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
