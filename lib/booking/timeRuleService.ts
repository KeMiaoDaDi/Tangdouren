import type { BusinessConfig } from './config'

// ── 基础时间工具 ──────────────────────────────────────────────────────────────

/** "HH:MM" → 分钟数 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 分钟数 → "HH:MM" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 时间字符串加分钟 */
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes)
}

// ── 基础半小时档生成 ──────────────────────────────────────────────────────────

/**
 * 生成营业时间内的全部基础半小时档（分钟数列表）
 * 例: [660, 690, 720, ...] = [11:00, 11:30, 12:00, ...]
 */
export function generateBaseSlots(cfg: BusinessConfig): number[] {
  const open  = timeToMinutes(cfg.openTime)
  const close = timeToMinutes(cfg.closeTime)
  const slots: number[] = []
  for (let t = open; t < close; t += cfg.defaultSlotStepMinutes) {
    slots.push(t)
  }
  return slots
}

/**
 * 找到 afterMinutes 之后第一个基础半小时档（分钟数）
 * 不包含 afterMinutes 本身
 */
export function getNextBaseSlot(afterMinutes: number, baseSlots: number[]): number | null {
  return baseSlots.find(t => t > afterMinutes) ?? null
}

// ── 桌位候选开始时间生成 ──────────────────────────────────────────────────────

/**
 * 根据某张桌当日已有预约，生成该桌的候选开始时间序列（分钟数）
 *
 * 规则：
 * - 默认使用基础半小时档
 * - 每有一条预约结束后：
 *   - 找到 endTime 之后的下一个基础半小时档 (nextBase)
 *   - 若 endTime+buffer ≠ nextBase，则用 endTime+buffer 替换 nextBase（前移）
 *   - 若 endTime+buffer = nextBase，不变
 */
export function generateTableCandidateStartTimes(
  bookingsOnTable: { start_time: string; end_time: string }[],
  cfg: BusinessConfig,
): number[] {
  const baseSlots = generateBaseSlots(cfg)
  const slotSet   = new Set(baseSlots)

  for (const booking of bookingsOnTable) {
    const endMin      = timeToMinutes(booking.end_time)
    const bufferedEnd = endMin + cfg.cleanupBufferMinutes
    const nextBase    = getNextBaseSlot(endMin, baseSlots)

    if (nextBase !== null && bufferedEnd !== nextBase) {
      slotSet.delete(nextBase)
      slotSet.add(bufferedEnd)
    }
    // 若 bufferedEnd === nextBase：nextBase 保留，无需改变
  }

  return [...slotSet].sort((a, b) => a - b)
}

// ── 可选时长列表 ──────────────────────────────────────────────────────────────

/** 返回所有合法时长（分钟），如 [60, 90, 120, 150, 180, 210, 240, 270, 300] */
export function getValidDurations(cfg: BusinessConfig): number[] {
  const durations: number[] = []
  for (
    let d = cfg.minDurationMinutes;
    d <= cfg.maxDurationMinutes;
    d += cfg.durationStepMinutes
  ) {
    durations.push(d)
  }
  return durations
}

// ── 营业时间校验 ──────────────────────────────────────────────────────────────

/**
 * 判断某个预约（开始时间 + 时长）是否在营业时间内
 * 约束：endTime (不含buffer) <= closeTime
 */
export function fitsWithinBusinessHours(
  startMinutes:    number,
  durationMinutes: number,
  cfg:             BusinessConfig,
): boolean {
  const open  = timeToMinutes(cfg.openTime)
  const close = timeToMinutes(cfg.closeTime)
  return startMinutes >= open && (startMinutes + durationMinutes) <= close
}

// ── 时间格式化工具 ────────────────────────────────────────────────────────────

/** 将时长分钟数转为可读字符串，如 60→"1小时", 90→"1.5小时", 120→"2小时" */
export function formatDuration(minutes: number): string {
  const h = minutes / 60
  return h === Math.floor(h) ? `${h}小时` : `${h}小时`
}
