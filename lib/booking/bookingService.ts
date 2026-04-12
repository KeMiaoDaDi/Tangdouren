import type { SupabaseClient } from '@supabase/supabase-js'
import { BUSINESS_CONFIG as cfg } from './config'
import type { CreateBookingRequest, CreateBookingResponse, ExistingBooking } from './types'
import { timeToMinutes, minutesToTime, fitsWithinBusinessHours } from './timeRuleService'
import { getAvailability, mapDbRowToExisting } from './availabilityService'
import { assignTable } from './tableAssignmentService'
import { getPartySizeCategory } from './config'

// ── 日期是否被封禁 ────────────────────────────────────────────────────────────

async function checkBlocked(supabase: SupabaseClient, date: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_dates')
    .select('date')
    .eq('date', date)
    .maybeSingle()
  return !!data
}

// ── 加载当日所有有效预约 ──────────────────────────────────────────────────────

async function loadDateBookings(supabase: SupabaseClient, date: string): Promise<ExistingBooking[]> {
  const { data, error } = await supabase
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
  return (data ?? []).map(mapDbRowToExisting)
}

// ── 二次校验 + 提交预约（含并发保护） ────────────────────────────────────────

export async function createBooking(
  req:     CreateBookingRequest,
  supabase: SupabaseClient,
): Promise<CreateBookingResponse> {
  const { date, partySize, acceptsSharing, startTime, durationMinutes, customerName, email, remark } = req

  // 1. 基础参数校验
  const startMin = timeToMinutes(startTime)
  if (!fitsWithinBusinessHours(startMin, durationMinutes, cfg)) {
    throw new BookingError('该时间段超出营业时间范围', 400)
  }

  // 2. 日期封禁检查
  const isBlocked = await checkBlocked(supabase, date)
  if (isBlocked) throw new BookingError('该日期已停止预约', 400)

  // 3. 二次校验可用性（防止在用户操作期间被占用）
  const allBookings = await loadDateBookings(supabase, date)

  const availability = getAvailability({
    partySize,
    acceptsSharing,
    allBookings,
    startTimeFilter:  startTime,
    durationFilter:   durationMinutes,
  })

  if (availability.length === 0) {
    throw new BookingError('该时段已无法预约，请重新选择', 409)
  }

  // 4. 二次分配桌位
  const assignment = assignTable(partySize, acceptsSharing, startTime, durationMinutes, allBookings)
  if (!assignment) {
    throw new BookingError('暂无可用桌位，请重新选择', 409)
  }

  // 5. 计算结束时间
  const endMin        = startMin + durationMinutes
  const bufferedEnd   = endMin + cfg.cleanupBufferMinutes
  const endTime       = minutesToTime(endMin)
  const bufferedEndTime = minutesToTime(bufferedEnd)

  // 6. 查询桌位 ID（若 assignment.tableId 为空则从 DB 查）
  let tableId = assignment.tableId
  if (!tableId) {
    const { data: tableRow } = await supabase
      .from('tables')
      .select('table_id')
      .eq('table_code', assignment.tableCode)
      .single()
    tableId = tableRow?.table_id ?? null
  }

  // 7. 写入预约记录
  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      booking_date:               date,
      customer_name:              customerName,
      email,
      party_size:                 partySize,
      accepts_sharing:            acceptsSharing,
      start_time:                 startTime,
      end_time:                   endTime,
      buffered_end_time:          bufferedEndTime,
      estimated_duration_minutes: durationMinutes,
      assigned_table_id:          tableId || null,
      assigned_table_code:        assignment.tableCode,
      assigned_table_type:        assignment.tableType,
      booking_mode:               assignment.bookingMode,
      seat_group_type:            assignment.seatGroupType,
      status:                     'confirmed',
      remark:                     remark ?? null,
    })
    .select('booking_id')
    .single()

  if (insertErr) throw insertErr

  return {
    bookingId:         booking.booking_id,
    assignedTableCode: assignment.tableCode,
    assignedTableType: assignment.tableType,
    bookingMode:       assignment.bookingMode,
    endTime,
    bufferedEndTime,
    message:           '预约成功！您的名额已锁定。',
  }
}

// ── 自定义错误类 ──────────────────────────────────────────────────────────────

export class BookingError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
    this.name = 'BookingError'
  }
}

// ── 人数分类导出（供 API 层使用） ─────────────────────────────────────────────
export { getPartySizeCategory }
