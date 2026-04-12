import {
  type TableType,
  type PartySizeCategory,
  EXACT_TABLE_TYPE,
  SHARING_UPGRADE_TYPE,
  SHARED_TABLE_ALLOWED_CATEGORY,
  TABLE_TYPE_DISPLAY,
  getPartySizeCategory,
} from './config'
import type { BookingMode, SeatGroupType, ExistingBooking } from './types'

// ── 桌型判断 ──────────────────────────────────────────────────────────────────

/**
 * 给定人数分类 + 桌型，判断这是否是一个私人整桌预约
 * (即桌型与人数严格匹配，单人用单人桌，双人用双人桌，团体用四人桌)
 */
export function isPrivateExactMatch(
  category:  PartySizeCategory,
  tableType: TableType,
): boolean {
  return EXACT_TABLE_TYPE[category] === tableType
}

/**
 * 给定人数分类 + 桌型，判断这是否是一个拼桌升级场景
 * (1人用双人桌 / 2人用四人桌)
 */
export function isSharedUpgrade(
  category:  PartySizeCategory,
  tableType: TableType,
): boolean {
  return SHARING_UPGRADE_TYPE[category] === tableType
}

// ── seat_group_type 推导 ──────────────────────────────────────────────────────

/**
 * 根据人数分类 + 实际桌型推导 SeatGroupType
 */
export function deriveSeatGroupType(
  category:  PartySizeCategory,
  tableType: TableType,
): SeatGroupType {
  if (category === 'single' && tableType === 'single') return 'single_on_single'
  if (category === 'single' && tableType === 'double') return 'single_on_double_shared'
  if (category === 'pair'   && tableType === 'double') return 'double_on_double'
  if (category === 'pair'   && tableType === 'four'  ) return 'double_on_four_shared'
  if (category === 'group'  && tableType === 'four'  ) return 'group_on_four'
  throw new Error(`无效组合: ${category} on ${tableType}`)
}

/**
 * 根据人数分类 + 实际桌型推导 BookingMode
 */
export function deriveBookingMode(
  category:  PartySizeCategory,
  tableType: TableType,
): BookingMode {
  if (isPrivateExactMatch(category, tableType)) return 'private_full_table'
  if (isSharedUpgrade(category, tableType))     return 'shared_partial_table'
  throw new Error(`无效组合: ${category} on ${tableType}`)
}

// ── 拼桌兼容性判断 ────────────────────────────────────────────────────────────

/**
 * 判断一条现有预约是否与新的拼桌请求兼容
 * （类型一致，且都是 shared_partial_table）
 */
export function isCompatibleSharedBooking(
  existing:       ExistingBooking,
  newCategory:    PartySizeCategory,
  upgradeTableType: TableType,
): boolean {
  if (existing.bookingMode !== 'shared_partial_table') return false
  if (existing.assignedTableType !== upgradeTableType)  return false

  const allowedCategory = SHARED_TABLE_ALLOWED_CATEGORY[upgradeTableType]
  return allowedCategory === newCategory && allowedCategory === getPartySizeCategory(existing.partySize)
}

// ── displayTag 生成 ───────────────────────────────────────────────────────────

/**
 * 生成前端展示标签（后端权威，前端不重算）
 */
export function buildDisplayTag(
  category:       PartySizeCategory,
  tableType:      TableType,
  isSharedOption: boolean,
): string {
  if (!isSharedOption) {
    return TABLE_TYPE_DISPLAY[tableType]
  }
  return `拼桌：${TABLE_TYPE_DISPLAY[tableType]}`
}
