import {
  TABLE_DEFINITIONS,
  EXACT_TABLE_TYPE,
  SHARING_UPGRADE_TYPE,
  RESOURCE_PRIORITY,
  getPartySizeCategory,
  type TableType,
} from './config'
import type { ExistingBooking, TableDef, AssignmentResult } from './types'
import { BUSINESS_CONFIG as cfg } from './config'
import { timeToMinutes } from './timeRuleService'
import {
  isTableFreeForPrivate,
  isSharedSlotAvailable,
  hasExistingSharedBookings,
} from './resourceMatchingService'
import {
  deriveSeatGroupType,
  deriveBookingMode,
} from './sharingRuleService'

// ── 辅助：按桌分组 ────────────────────────────────────────────────────────────

function groupBookingsByTable(bookings: ExistingBooking[]): Map<string, ExistingBooking[]> {
  const map = new Map<string, ExistingBooking[]>()
  for (const b of bookings) {
    const key = b.assignedTableCode
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(b)
  }
  return map
}

// ── 主分配逻辑 ────────────────────────────────────────────────────────────────

/**
 * 按优先级为新预约分配桌位
 *
 * 不接受拼桌：
 *   1人 → 只查单人桌
 *   2人 → 只查双人桌
 *   3-4人 → 只查四人桌
 *
 * 接受拼桌：
 *   1人 → 1) 已开启的双人桌单人拼桌空位 → 2) 空闲单人桌 → 3) 空闲双人桌整桌（新开共享）
 *   2人 → 1) 已开启的四人桌双人拼桌空位 → 2) 空闲双人桌 → 3) 空闲四人桌整桌（新开共享）
 *   3-4人 → 只查空闲四人桌
 */
export function assignTable(
  partySize:      number,
  acceptsSharing: boolean,
  startTime:      string,
  durationMinutes: number,
  allBookings:    ExistingBooking[],
): AssignmentResult | null {
  const category    = getPartySizeCategory(partySize)
  const startMin    = timeToMinutes(startTime)
  const endMin      = startMin + durationMinutes
  const buffer      = cfg.cleanupBufferMinutes

  const bookingsByTable = groupBookingsByTable(allBookings)

  const tables: TableDef[] = TABLE_DEFINITIONS.map(t => ({ ...t, isActive: true }))

  const priorities = acceptsSharing
    ? RESOURCE_PRIORITY[category]
    : (['exact_private'] as const)

  for (const priority of priorities) {
    if (priority === 'exact_private') {
      // 私人整桌：严格匹配桌型，完全空闲
      const targetType = EXACT_TABLE_TYPE[category]
      for (const table of tables) {
        if (table.tableType !== targetType || !table.isActive) continue
        const tableBookings = bookingsByTable.get(table.tableCode) ?? []
        if (isTableFreeForPrivate(tableBookings, startMin, endMin, buffer)) {
          return buildResult(table, category, targetType, false)
        }
      }
    }

    if (priority === 'existing_shared') {
      // 已开启的拼桌桌有空位
      const upgradeType = SHARING_UPGRADE_TYPE[category]
      if (!upgradeType) continue

      for (const table of tables) {
        if (table.tableType !== upgradeType || !table.isActive) continue
        const tableBookings = bookingsByTable.get(table.tableCode) ?? []

        // 必须已有同类拼桌预约
        if (!hasExistingSharedBookings(table, tableBookings, category, startMin, endMin, buffer)) continue

        if (isSharedSlotAvailable(table, tableBookings, category, category === 'single' ? 1 : 2, startMin, endMin, buffer)) {
          return buildResult(table, category, upgradeType, true)
        }
      }
    }

    if (priority === 'new_shared') {
      // 空闲的升级桌（新开为拼桌桌）
      const upgradeType = SHARING_UPGRADE_TYPE[category]
      if (!upgradeType) continue

      for (const table of tables) {
        if (table.tableType !== upgradeType || !table.isActive) continue
        const tableBookings = bookingsByTable.get(table.tableCode) ?? []

        if (isTableFreeForPrivate(tableBookings, startMin, endMin, buffer)) {
          return buildResult(table, category, upgradeType, true)
        }
      }
    }
  }

  return null
}

function buildResult(
  table:      TableDef,
  category:   ReturnType<typeof getPartySizeCategory>,
  tableType:  TableType,
  isShared:   boolean,
): AssignmentResult {
  void isShared
  return {
    tableId:       table.tableId ?? '',
    tableCode:     table.tableCode,
    tableType,
    bookingMode:   deriveBookingMode(category, tableType),
    seatGroupType: deriveSeatGroupType(category, tableType),
  }
}
