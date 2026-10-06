// ============================================================
// 会员：Visit 口径、奖励进度、奖励可用性与折扣计算的纯函数
//
// 奖励机制（2026-10 改版）：每 10 个 Reward-eligible Visit 为一轮，
// 到第 3 / 5 / 7 / 10 次各解锁一张「一次性百分比折扣」奖励：
//   第 3 次 → 9折（10% off）
//   第 5 次 → 8折（20% off）
//   第 7 次 → 7折（30% off）
//   第 10 次 → 5折（50% off）
// 第 2 轮及以后靠 10 ×(轮次 - 1) + 档位 推到 13 / 15 / 17 / 20，无限循环。
// 所有奖励都是「本人订单的百分比折扣」，核销一次即用掉，不可转赠。
//
// 约定：
//   1) 金额一律换算成「便士整数」计算，与 lib/coupon/coupon.ts 同一套口径。
//   2) 折扣金额在这里算一遍，settle_timer_session 会拿数据库记录再复核一遍，
//      对不上就报错。改这里必须同步改 supabase/migrations/017_member_settlement.sql。
//   3) 本文件不碰数据库、不碰 React，可在浏览器、服务端与测试里共用。
// ============================================================

import { describeDiscount, londonToday, toPence, fromPence } from '../coupon/coupon.ts'

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 每 10 个 Reward-eligible Visit 为一轮 */
export const REWARD_CYCLE_SIZE = 10

export type RewardType =
  | 'P10_OFF'   // 9折 = 10% off
  | 'P20_OFF'   // 8折 = 20% off
  | 'P30_OFF'   // 7折 = 30% off
  | 'P50_OFF'   // 5折 = 50% off

/** 每种奖励对应的「off 百分比」，是折扣值的唯一来源（前端预览与 SQL 复核共用） */
export const REWARD_DISCOUNT_PERCENT: Record<RewardType, number> = {
  P10_OFF: 10,
  P20_OFF: 20,
  P30_OFF: 30,
  P50_OFF: 50,
}

/** 一次结算只允许一个折扣来源（会员奖励不再有 VIP 月卡这条来源） */
export type DiscountSource = 'none' | 'coupon' | 'member_reward'

/** 一轮里各档位的门槛与对应奖励。第 2 轮及以后靠 10 ×(轮次 - 1) + 档位 推到 13 / 15 / 17 / 20 */
export const CYCLE_REWARD_NODES: readonly { node: number; rewardTypes: readonly RewardType[] }[] = [
  { node: 3,  rewardTypes: ['P10_OFF'] },
  { node: 5,  rewardTypes: ['P20_OFF'] },
  { node: 7,  rewardTypes: ['P30_OFF'] },
  { node: 10, rewardTypes: ['P50_OFF'] },
]

/** 可以在结算台作为折扣使用的奖励类型（现在全部奖励都是折扣，四档都在内） */
export const USABLE_REWARD_TYPES: readonly RewardType[] = [
  'P10_OFF', 'P20_OFF', 'P30_OFF', 'P50_OFF',
]

export interface MemberRewardRow {
  reward_id:      string
  member_id:      string
  reward_type:    RewardType
  cycle_index:    number
  unlocked_at:    string
  used_at:        string | null
}

// ── 身份 ────────────────────────────────────────────────────────────────────

/** 会员以邮箱为唯一身份。email_key = lower(trim(email))，与数据库 members_email_key_check 同口径 */
export function normalizeMemberEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/** 邮箱形状：@ 前面要有东西，@ 后面要有域名点号（与 members_email_shape_check 同口径） */
export function isValidMemberEmail(email: string): boolean {
  const at = email.indexOf('@')
  if (at <= 0) return false
  const domain = email.slice(at + 1)
  const dot = domain.indexOf('.')
  return dot > 0 && dot < domain.length - 1 && !/\s/.test(email)
}

/** 客户端展示用的脱敏邮箱：z***@gmail.com（前后端都不提供改邮箱） */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

// ── 日期（一律按伦敦自然日）────────────────────────────────────────────────

/** 某个时刻对应的伦敦当地日期。Visit 归日用它，跨午夜算到店那天 */
export function londonDateOf(at: Date | string): string {
  return londonToday(typeof at === 'string' ? new Date(at) : at)
}

/** YYYY-MM-DD 加 n 天，用 UTC 做纯日期运算，不受运行环境时区影响 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return d.toISOString().slice(0, 10)
}

// ── Visit 口径（与 member_visit_days 视图同口径）────────────────────────────

export interface VisitSessionRow {
  session_id:      string
  member_id:       string | null
  started_at:      string
  is_settled:      boolean
  reward_eligible: boolean | null
  /** 下面两个只有会员页要用来展示「这一单走了什么折扣」，Visit 口径本身不需要 */
  discount_amount_gbp?: number | null
  coupon_code_snapshot?: string | null
}

export interface VisitDay {
  visit_date:      string
  reward_eligible: boolean
}

/**
 * 把计时单压成「访日」列表，与 SQL 视图 member_visit_days 完全同口径：
 *   只认有会员归属且已结算的单；按伦敦日期合并；当天只要有一条计入进度就算。
 */
export function buildVisitDays(sessions: VisitSessionRow[]): VisitDay[] {
  const byDate = new Map<string, VisitDay>()
  for (const s of sessions) {
    if (!s.member_id || !s.is_settled) continue
    const date = londonDateOf(s.started_at)
    const day = byDate.get(date) ?? { visit_date: date, reward_eligible: false }
    day.reward_eligible = day.reward_eligible || Boolean(s.reward_eligible)
    byDate.set(date, day)
  }
  return [...byDate.values()].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
}

/** Lifetime Visits：真实到店次数（每一访日算一次） */
export function countLifetimeVisits(visits: VisitDay[]): number {
  return visits.length
}

/**
 * Reward Progress：只认计入进度的访日。
 * false 只来自后台把已结算的散客单补挂到会员名下（link_timer_session_to_member），
 * 那一单进 Lifetime、不进 Progress。
 */
export function countRewardProgress(visits: VisitDay[]): number {
  return visits.filter(v => v.reward_eligible).length
}

// ── 轮次、进度与解锁 ────────────────────────────────────────────────────────

/** 第 cycle 轮第 node 个档位对应的累计 Progress */
export function rewardThreshold(cycleIndex: number, node: number): number {
  return REWARD_CYCLE_SIZE * (cycleIndex - 1) + node
}

export interface UnlockedReward {
  cycle_index: number
  reward_type: RewardType
  threshold:   number
}

/** 当前 Progress 应该已经解锁的全部奖励。与 ensure_member_rewards 的循环同一个规则 */
export function unlockedRewardsForProgress(progress: number): UnlockedReward[] {
  if (progress <= 0) return []
  const unlocked: UnlockedReward[] = []
  const cycles = Math.floor((progress - 1) / REWARD_CYCLE_SIZE) + 1
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const { node, rewardTypes } of CYCLE_REWARD_NODES) {
      const threshold = rewardThreshold(cycle, node)
      if (progress < threshold) continue
      for (const reward_type of rewardTypes) {
        unlocked.push({ cycle_index: cycle, reward_type, threshold })
      }
    }
  }
  return unlocked
}

export interface NextReward {
  cycle_index: number
  node:        number
  threshold:   number
  remaining:   number
  rewardTypes: readonly RewardType[]
}

/** 还差几次到下一个奖励 */
export function nextReward(progress: number): NextReward | null {
  const cycle = Math.floor(progress / REWARD_CYCLE_SIZE) + 1
  for (const { node, rewardTypes } of CYCLE_REWARD_NODES) {
    const threshold = rewardThreshold(cycle, node)
    if (progress < threshold) {
      return { cycle_index: cycle, node, threshold, remaining: threshold - progress, rewardTypes }
    }
  }
  return null
}

/** 十格进度条里当前点亮几格。内部总进度不清零，顾客端按 10 循环显示 */
export function cycleProgress(progress: number): number {
  if (progress <= 0) return 0
  const filled = progress % REWARD_CYCLE_SIZE
  return filled === 0 ? REWARD_CYCLE_SIZE : filled
}

export type ProgressCellState = 'done' | 'current' | 'todo'

export interface ProgressCell {
  index:        number          // 1..10
  threshold:    number          // 该格对应的累计 Progress
  isRewardNode: boolean
  rewardTypes:  readonly RewardType[]
  state:        ProgressCellState
}

/** 进度条的十格数据。顾客端不显示 Cycle 1 / Cycle 2 这类技术概念 */
export function progressBarCells(progress: number): ProgressCell[] {
  const cycle = Math.floor(progress / REWARD_CYCLE_SIZE) + 1
  const filled = cycleProgress(progress)
  return Array.from({ length: REWARD_CYCLE_SIZE }, (_, i) => {
    const index = i + 1
    const node = CYCLE_REWARD_NODES.find(n => n.node === index)
    return {
      index,
      threshold:    rewardThreshold(cycle, index),
      isRewardNode: Boolean(node),
      rewardTypes:  node?.rewardTypes ?? [],
      state:        index <= filled ? 'done' : index === filled + 1 ? 'current' : 'todo',
    }
  })
}

// ── 奖励可用性 ──────────────────────────────────────────────────────────────

export type RewardState = 'available' | 'used'

export interface RewardAvailability {
  reward: MemberRewardRow
  state:  RewardState
}

/** 单个奖励当前能不能用：已用 → 可用（不再有转赠、VIP 暂停两类状态） */
export function rewardState(reward: MemberRewardRow): RewardState {
  return reward.used_at ? 'used' : 'available'
}

/** My Rewards 列表：已用的标成不可用，不隐藏 */
export function rewardAvailabilityList(rewards: MemberRewardRow[]): RewardAvailability[] {
  return rewards.map(reward => ({ reward, state: rewardState(reward) }))
}

/**
 * 结算台挑券：同类奖励里挑「最早解锁且未使用」的一张。
 * 排序与 SQL 的 ORDER BY unlocked_at, reward_id 保持一致，否则预览与实际核销会对不上。
 */
export function pickRewardForUse(
  rewards: MemberRewardRow[],
  rewardType: RewardType,
  excludeSessionId?: string | null,
): MemberRewardRow | null {
  const candidates = rewards
    .filter(r => r.reward_type === rewardType)
    .filter(r => rewardState(r) === 'available')
    .filter(r => !excludeSessionId || r.reward_id !== excludeSessionId)
    .sort((a, b) => a.unlocked_at.localeCompare(b.unlocked_at) || a.reward_id.localeCompare(b.reward_id))
  return candidates[0] ?? null
}

/** 会员当前可选的奖励类型（去重，供结算台下拉用） */
export function usableRewardTypes(rewards: MemberRewardRow[]): RewardType[] {
  const types = rewards
    .filter(r => USABLE_REWARD_TYPES.includes(r.reward_type))
    .filter(r => rewardState(r) === 'available')
    .map(r => r.reward_type)
  return [...new Set(types)]
}

// ── 折扣计算 ────────────────────────────────────────────────────────────────

export interface MemberDiscountPreview {
  source:              DiscountSource
  rewardType:          RewardType | null
  discountType:        'fixed_amount' | 'percentage_off'
  discountValue:       number
  description:         string
  preDiscountGbp:      number
  discountGbp:         number
  finalGbp:            number
  discountAmountPence: number
}

export type MemberDiscountResult =
  | { ok: true;  preview: MemberDiscountPreview }
  | { ok: false; error: MemberDiscountError }

export type MemberDiscountError =
  | 'SESSION_AMOUNT_MISSING'
  | 'DISCOUNT_SOURCE_INVALID'
  | 'COUPON_SOURCE_NOT_HANDLED'
  | 'REWARD_TYPE_INVALID'

export interface MemberDiscountContext {
  amountGbp:  number | null | undefined
  rewardType?: RewardType | null
}

/**
 * 会员折扣的唯一计算入口（与 computeSettlement 并列，互不叠加）。
 * 错误码与 017 里 settle_timer_session 抛出的错误码同名，前端可以直接按码给文案。
 */
export function computeMemberDiscount(
  source: DiscountSource,
  ctx: MemberDiscountContext,
): MemberDiscountResult {
  if (ctx.amountGbp === null || ctx.amountGbp === undefined) {
    return { ok: false, error: 'SESSION_AMOUNT_MISSING' }
  }
  const prePence = toPence(ctx.amountGbp)

  if (source === 'coupon') return { ok: false, error: 'COUPON_SOURCE_NOT_HANDLED' }
  if (source !== 'none' && source !== 'member_reward') {
    return { ok: false, error: 'DISCOUNT_SOURCE_INVALID' }
  }

  let rewardType: RewardType | null = null
  let discountType: 'fixed_amount' | 'percentage_off' = 'fixed_amount'
  let discountValue = 0
  let discountPence = 0

  if (source === 'none') {
    discountPence = 0
  } else {
    const type = ctx.rewardType ?? null
    if (!type || !USABLE_REWARD_TYPES.includes(type)) {
      return { ok: false, error: 'REWARD_TYPE_INVALID' }
    }
    rewardType = type
    discountType = 'percentage_off'
    discountValue = REWARD_DISCOUNT_PERCENT[type]
    discountPence = percentOffPence(prePence, discountValue)
  }

  const finalPence = prePence - discountPence
  return {
    ok: true,
    preview: {
      source,
      rewardType,
      discountType,
      discountValue,
      description: source === 'none'
        ? '不使用会员优惠'
        : describeDiscount(discountType, discountValue),
      preDiscountGbp:      fromPence(prePence),
      discountGbp:         fromPence(discountPence),
      finalGbp:            fromPence(finalPence),
      discountAmountPence: discountPence,
    },
  }
}

/** 百分比折扣：按分四舍五入，与 SQL 的 ROUND(原价 pence × 百分比 / 100) 同口径 */
export function percentOffPence(prePence: number, percent: number): number {
  return Math.round(prePence * percent / 100)
}
