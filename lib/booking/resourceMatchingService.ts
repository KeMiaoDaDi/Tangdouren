import type { ExistingBooking, TableDef, SeatGroupType } from './types'
import type { PartySizeCategory } from './config'
import { timeToMinutes } from './timeRuleService'
import { isCompatibleSharedBooking, deriveSeatGroupType } from './sharingRuleService'
import { SHARING_UPGRADE_TYPE } from './config'

// ── 时段占用冲突检测 ──────────────────────────────────────────────────────────

/**
 * 判断两个"含缓冲结束时间"的区间是否重叠
 * 区间为左闭右开 [start, bufferedEnd)
 */
function rangesOverlap(
  s1: number, e1: number,
  s2: number, e2: number,
): boolean {
  return s1 < e2 && s2 < e1
}

// ── 私人整桌可用性 ────────────────────────────────────────────────────────────

/**
 * 判断某桌在 [startMin, endMin+buffer) 时段内是否完全空闲（可做私人预约）
 * 无论现有预约是 private 还是 shared，只要有任何重叠就视为不可用
 */
export function isTableFreeForPrivate(
  tableBookings:   ExistingBooking[],
  startMin:        number,
  endMin:          number,   // 不含 buffer
  bufferMinutes:   number,
): boolean {
  const newBufferedEnd = endMin + bufferMinutes
  return tableBookings
    .filter(b => b.status !== 'cancelled')
    .every(b => {
      const bStart       = timeToMinutes(b.startTime)
      const bBufferedEnd = timeToMinutes(b.bufferedEndTime)
      return !rangesOverlap(startMin, newBufferedEnd, bStart, bBufferedEnd)
    })
}

// ── 拼桌空位可用性 ────────────────────────────────────────────────────────────

/**
 * 判断某桌在 [startMin, endMin+buffer) 时段内是否有拼桌空位
 *
 * 规则：
 * 1. 所有与新区间重叠的现有预约必须是相同类型的 shared 预约
 * 2. 任意时间点的并发人数 ≤ 桌位容量
 */
export function isSharedSlotAvailable(
  table:         TableDef,
  tableBookings: ExistingBooking[],
  newCategory:   PartySizeCategory,
  newPartySize:  number,
  startMin:      number,
  endMin:        number,
  bufferMinutes: number,
): boolean {
  const upgradeType = SHARING_UPGRADE_TYPE[newCategory]
  if (!upgradeType || table.tableType !== upgradeType) return false

  const newBufferedEnd = endMin + bufferMinutes
  const newSeatGroup: SeatGroupType = deriveSeatGroupType(newCategory, upgradeType)

  // 找出所有与新预约时段重叠的现有预约
  const overlapping = tableBookings.filter(b => {
    if (b.status === 'cancelled') return false
    const bStart       = timeToMinutes(b.startTime)
    const bBufferedEnd = timeToMinutes(b.bufferedEndTime)
    return rangesOverlap(startMin, newBufferedEnd, bStart, bBufferedEnd)
  })

  // 所有重叠预约必须是兼容的拼桌类型
  for (const b of overlapping) {
    if (!isCompatibleSharedBooking(b, newCategory, upgradeType)) return false
  }

  // 检查任意事件点（边界时刻）并发人数 ≤ 容量
  const eventPoints = new Set<number>([startMin])
  for (const b of overlapping) {
    const bStart       = timeToMinutes(b.startTime)
    const bBufferedEnd = timeToMinutes(b.bufferedEndTime)
    if (bStart > startMin && bStart < newBufferedEnd)       eventPoints.add(bStart)
    if (bBufferedEnd > startMin && bBufferedEnd < newBufferedEnd) eventPoints.add(bBufferedEnd)
  }

  for (const t of eventPoints) {
    let total = newPartySize
    for (const b of overlapping) {
      const bStart       = timeToMinutes(b.startTime)
      const bBufferedEnd = timeToMinutes(b.bufferedEndTime)
      if (t >= bStart && t < bBufferedEnd) total += b.partySize
    }
    if (total > table.capacity) return false
  }

  // 校验 seatGroupType 未混入私人整桌预约
  const hasPrivateBooking = overlapping.some(b => b.bookingMode === 'private_full_table')
  if (hasPrivateBooking) return false

  void newSeatGroup  // 类型已在 isCompatibleSharedBooking 中校验
  return true
}

// ── 已有拼桌桌上的空位检查（现有 shared 桌 + 还有空间） ───────────────────────

/**
 * 判断桌上是否已存在同类型的 shared 预约（即已是"已开启的拼桌桌"）
 * 用于区分 existing_shared 和 new_shared 两种情况
 */
export function hasExistingSharedBookings(
  table:         TableDef,
  tableBookings: ExistingBooking[],
  newCategory:   PartySizeCategory,
  startMin:      number,
  endMin:        number,
  bufferMinutes: number,
): boolean {
  const upgradeType = SHARING_UPGRADE_TYPE[newCategory]
  if (!upgradeType || table.tableType !== upgradeType) return false

  const newBufferedEnd = endMin + bufferMinutes

  return tableBookings.some(b => {
    if (b.status === 'cancelled') return false
    if (!isCompatibleSharedBooking(b, newCategory, upgradeType)) return false
    const bStart       = timeToMinutes(b.startTime)
    const bBufferedEnd = timeToMinutes(b.bufferedEndTime)
    return rangesOverlap(startMin, newBufferedEnd, bStart, bBufferedEnd)
  })
}
