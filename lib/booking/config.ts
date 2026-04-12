// ============================================================
// 拼豆工作室预约系统 — 业务配置
// 修改营业时间/缓冲/桌位/拼桌规则时只改这里
// ============================================================

export const BUSINESS_CONFIG = {
  openTime:                    '11:00',
  closeTime:                   '21:00',
  durationStepMinutes:         30,
  minDurationMinutes:          60,
  maxDurationMinutes:          300,
  cleanupBufferMinutes:        15,
  defaultSlotStepMinutes:      30,   // 基础半小时档
  shiftAdvanceMinutes:         15,   // 下一档前移量
} as const

export type BusinessConfig = typeof BUSINESS_CONFIG

// 物理桌位定义
export const TABLE_DEFINITIONS = [
  { tableCode: 'S1', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'S2', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'S3', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'S4', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'S5', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'S6', tableType: 'single' as const, capacity: 1 },
  { tableCode: 'D1', tableType: 'double' as const, capacity: 2 },
  { tableCode: 'D2', tableType: 'double' as const, capacity: 2 },
  { tableCode: 'D3', tableType: 'double' as const, capacity: 2 },
  { tableCode: 'D4', tableType: 'double' as const, capacity: 2 },
  { tableCode: 'F1', tableType: 'four'   as const, capacity: 4 },
  { tableCode: 'F2', tableType: 'four'   as const, capacity: 4 },
] as const

export type TableType = 'single' | 'double' | 'four'

// 人数分类
export type PartySizeCategory = 'single' | 'pair' | 'group'

export function getPartySizeCategory(partySize: number): PartySizeCategory {
  if (partySize === 1) return 'single'
  if (partySize === 2) return 'pair'
  return 'group'  // 3-4 人
}

// 实际 party_size 数值（用于 API 传参：1/2/3 分别代表 1人/2人/3-4人）
export function apiPartySizeToActual(apiPartySize: number): number {
  return apiPartySize  // 1 or 2 直接用; 3 代表 "3-4人" 取最小值 3
}

// 不接受拼桌时的严格桌型
export const EXACT_TABLE_TYPE: Record<PartySizeCategory, TableType> = {
  single: 'single',
  pair:   'double',
  group:  'four',
}

// 接受拼桌时可升级的桌型（null = 不升级）
export const SHARING_UPGRADE_TYPE: Record<PartySizeCategory, TableType | null> = {
  single: 'double',  // 1人可升级到双人桌
  pair:   'four',    // 2人可升级到四人桌
  group:  null,      // 3-4人不参与拼桌升级
}

// 拼桌时，共享桌内允许的人数类型（按升级桌型）
// double 共享桌只允许 single-person 进入
// four   共享桌只允许 pair 进入
export const SHARED_TABLE_ALLOWED_CATEGORY: Partial<Record<TableType, PartySizeCategory>> = {
  double: 'single',
  four:   'pair',
}

// 桌型展示名
export const TABLE_TYPE_DISPLAY: Record<TableType, string> = {
  single: '单人桌',
  double: '双人桌',
  four:   '四人桌',
}

// 资源匹配优先级（接受拼桌时，按此顺序分配）
export const RESOURCE_PRIORITY: Record<PartySizeCategory, Array<'exact_private' | 'existing_shared' | 'new_shared'>> = {
  single: ['existing_shared', 'exact_private', 'new_shared'],
  pair:   ['existing_shared', 'exact_private', 'new_shared'],
  group:  ['exact_private'],
}
