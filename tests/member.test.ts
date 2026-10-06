import assert from 'node:assert/strict'
import test from 'node:test'
import { calcBill } from '../lib/timer/pricing.ts'
import {
  CYCLE_REWARD_NODES,
  REWARD_CYCLE_SIZE,
  REWARD_DISCOUNT_PERCENT,
  buildVisitDays,
  computeMemberDiscount,
  countLifetimeVisits,
  countRewardProgress,
  cycleProgress,
  isValidMemberEmail,
  londonDateOf,
  maskEmail,
  nextReward,
  normalizeMemberEmail,
  percentOffPence,
  pickRewardForUse,
  progressBarCells,
  rewardAvailabilityList,
  rewardState,
  rewardThreshold,
  unlockedRewardsForProgress,
  usableRewardTypes,
  type MemberRewardRow,
  type RewardType,
  type VisitSessionRow,
} from '../lib/member/member.ts'

// ── 测试辅助 ────────────────────────────────────────────────────────────────

function session(startedAt: string, opts: Partial<VisitSessionRow> = {}): VisitSessionRow {
  return {
    session_id:      `T-${startedAt}`,
    member_id:       'member-1',
    started_at:      startedAt,
    is_settled:      true,
    reward_eligible: true,
    ...opts,
  }
}

let rewardSeq = 0
function reward(type: RewardType, opts: Partial<MemberRewardRow> = {}): MemberRewardRow {
  rewardSeq += 1
  return {
    reward_id:   `reward-${String(rewardSeq).padStart(3, '0')}`,
    member_id:   'member-1',
    reward_type: type,
    cycle_index: 1,
    unlocked_at: '2026-09-01T10:00:00Z',
    used_at:     null,
    ...opts,
  }
}

// ── 身份 ────────────────────────────────────────────────────────────────────

test('email_key 规范化：去首尾空格 + 转小写', () => {
  assert.equal(normalizeMemberEmail('  Wei@Example.COM '), 'wei@example.com')
  assert.equal(normalizeMemberEmail(null), '')
  assert.equal(normalizeMemberEmail(123), '')
})

test('重复邮箱的大小写与空格差异被识别成同一个人', () => {
  assert.equal(normalizeMemberEmail('Wei@Gmail.com'), normalizeMemberEmail('wei@gmail.com '))
})

test('邮箱形状校验与数据库 CHECK 同口径', () => {
  assert.equal(isValidMemberEmail('wei@gmail.com'), true)
  assert.equal(isValidMemberEmail('wei@sub.domain.co.uk'), true)
  assert.equal(isValidMemberEmail('wei@gmail'), false)
  assert.equal(isValidMemberEmail('@gmail.com'), false)
  assert.equal(isValidMemberEmail('wei.com'), false)
  assert.equal(isValidMemberEmail('wei@gmail.'), false)
  assert.equal(isValidMemberEmail('wei @gmail.com'), false)
})

test('脱敏邮箱只露出首字母与域名', () => {
  assert.equal(maskEmail('zhangwei@gmail.com'), 'z***@gmail.com')
  assert.equal(maskEmail('not-an-email'), '***')
})

// ── 伦敦自然日 ──────────────────────────────────────────────────────────────

test('Visit 归日用伦敦当地日期，跨午夜算到店那天', () => {
  // 伦敦夏令时 BST = UTC+1
  assert.equal(londonDateOf('2026-09-15T23:30:00Z'), '2026-09-16')
  assert.equal(londonDateOf('2026-09-16T00:30:00Z'), '2026-09-16')
  // 冬季 GMT = UTC
  assert.equal(londonDateOf('2026-01-15T23:30:00Z'), '2026-01-15')
  assert.equal(londonDateOf('2026-01-15T00:30:00Z'), '2026-01-15')
})

test('同一天的多条已结算单只算一个访日', () => {
  const visits = buildVisitDays([
    session('2026-09-15T09:00:00Z'),
    session('2026-09-15T15:00:00Z', { session_id: 'T-2' }),
    session('2026-09-16T09:00:00Z', { session_id: 'T-3' }),
  ])
  assert.deepEqual(visits.map(v => v.visit_date), ['2026-09-15', '2026-09-16'])
  assert.equal(countLifetimeVisits(visits), 2)
  assert.equal(countRewardProgress(visits), 2)
})

test('散客单与未结算单都不计入', () => {
  const visits = buildVisitDays([
    session('2026-09-15T09:00:00Z', { member_id: null }),
    session('2026-09-16T09:00:00Z', { is_settled: false }),
    session('2026-09-17T09:00:00Z', { reward_eligible: null }),
  ])
  assert.deepEqual(visits.map(v => v.visit_date), ['2026-09-17'])
  assert.equal(countLifetimeVisits(visits), 1)
  assert.equal(countRewardProgress(visits), 0)
})

test('后台补挂的已结算单进 Lifetime、不走进度，两个数因此会不同', () => {
  const visits = buildVisitDays([
    session('2026-09-10T12:00:00Z', { reward_eligible: true }),
    session('2026-09-11T12:00:00Z', { reward_eligible: false }),
    session('2026-09-12T12:00:00Z', { reward_eligible: false }),
  ])
  assert.equal(countLifetimeVisits(visits), 3)
  assert.equal(countRewardProgress(visits), 1)
})

test('同一天只要有一条计入进度，这一天就算（补挂不会回退已完成的进度）', () => {
  // 同一天两条单：一条计入进度，一条（后台补挂）不计入
  const visits = buildVisitDays([
    session('2026-09-18T09:00:00Z', { reward_eligible: true }),
    session('2026-09-18T18:00:00Z', { reward_eligible: false, session_id: 'T-2' }),
  ])
  assert.equal(countLifetimeVisits(visits), 1)
  assert.equal(countRewardProgress(visits), 1)
})

// ── 轮次与进度 ──────────────────────────────────────────────────────────────

test('档位门槛：第 2 轮落在 13 / 15 / 17 / 20', () => {
  assert.equal(rewardThreshold(1, 3), 3)
  assert.equal(rewardThreshold(1, 10), 10)
  assert.equal(rewardThreshold(2, 3), 13)
  assert.equal(rewardThreshold(2, 5), 15)
  assert.equal(rewardThreshold(2, 7), 17)
  assert.equal(rewardThreshold(2, 10), 20)
  assert.equal(rewardThreshold(3, 3), 23)
})

test('解锁集合随进度增长，每个档位解锁一种折扣', () => {
  assert.deepEqual(unlockedRewardsForProgress(0), [])
  assert.deepEqual(unlockedRewardsForProgress(2), [])
  assert.deepEqual(
    unlockedRewardsForProgress(3).map(r => [r.cycle_index, r.reward_type]),
    [[1, 'P10_OFF']],
  )
  assert.deepEqual(
    unlockedRewardsForProgress(7).map(r => r.reward_type),
    ['P10_OFF', 'P20_OFF', 'P30_OFF'],
  )
  assert.deepEqual(
    unlockedRewardsForProgress(10).map(r => r.reward_type),
    ['P10_OFF', 'P20_OFF', 'P30_OFF', 'P50_OFF'],
  )
})

test('第 2 轮的四个节点按 13 / 15 / 17 / 20 解锁', () => {
  const at13 = unlockedRewardsForProgress(13)
  assert.deepEqual(at13.slice(-1).map(r => [r.cycle_index, r.reward_type]), [[2, 'P10_OFF']])
  const at20 = unlockedRewardsForProgress(20)
  assert.deepEqual(
    at20.filter(r => r.cycle_index === 2).map(r => [r.threshold, r.reward_type]),
    [[13, 'P10_OFF'], [15, 'P20_OFF'], [17, 'P30_OFF'], [20, 'P50_OFF']],
  )
  assert.equal(at20.length, 8)
})

test('解锁数量单调不减，且同一档位只出现一次', () => {
  let previous = 0
  for (let progress = 0; progress <= 40; progress++) {
    const unlocked = unlockedRewardsForProgress(progress)
    assert.ok(unlocked.length >= previous, `progress ${progress} 解锁数倒退了`)
    previous = unlocked.length
    const keys = unlocked.map(r => `${r.cycle_index}:${r.reward_type}`)
    assert.equal(new Set(keys).size, keys.length, `progress ${progress} 出现重复档位`)
  }
})

test('下一个奖励与还差几次', () => {
  assert.deepEqual(nextReward(0), { cycle_index: 1, node: 3, threshold: 3, remaining: 3, rewardTypes: ['P10_OFF'] })
  assert.deepEqual(nextReward(3), { cycle_index: 1, node: 5, threshold: 5, remaining: 2, rewardTypes: ['P20_OFF'] })
  assert.deepEqual(nextReward(6), { cycle_index: 1, node: 7, threshold: 7, remaining: 1, rewardTypes: ['P30_OFF'] })
  assert.deepEqual(nextReward(10), { cycle_index: 2, node: 3, threshold: 13, remaining: 3, rewardTypes: ['P10_OFF'] })
  assert.deepEqual(nextReward(21), { cycle_index: 3, node: 3, threshold: 23, remaining: 2, rewardTypes: ['P10_OFF'] })
})

test('十格循环显示：内部总进度不清零', () => {
  assert.equal(cycleProgress(0), 0)
  assert.equal(cycleProgress(6), 6)
  assert.equal(cycleProgress(10), 10)
  assert.equal(cycleProgress(11), 1)
  assert.equal(cycleProgress(20), 10)
  assert.equal(cycleProgress(23), 3)
})

test('进度条格子：3 / 5 / 7 / 10 是奖励节点', () => {
  const cells = progressBarCells(6)
  assert.equal(cells.length, REWARD_CYCLE_SIZE)
  assert.deepEqual(cells.filter(c => c.isRewardNode).map(c => c.index), [3, 5, 7, 10])
  assert.deepEqual(cells.filter(c => c.state === 'done').map(c => c.index), [1, 2, 3, 4, 5, 6])
  assert.equal(cells[6].state, 'current')
  const roundTwo = progressBarCells(13)
  assert.equal(roundTwo[0].threshold, 11)
  assert.deepEqual(roundTwo.filter(c => c.state === 'done').map(c => c.index), [1, 2, 3])
})

test('奖励节点表就是新版 3 / 5 / 7 / 10 四档', () => {
  assert.deepEqual(
    CYCLE_REWARD_NODES.map(n => [n.node, n.rewardTypes]),
    [[3, ['P10_OFF']], [5, ['P20_OFF']], [7, ['P30_OFF']], [10, ['P50_OFF']]],
  )
})

test('折扣百分比表与奖励节点一一对应', () => {
  assert.deepEqual(REWARD_DISCOUNT_PERCENT, { P10_OFF: 10, P20_OFF: 20, P30_OFF: 30, P50_OFF: 50 })
})

// ── 奖励可用性 ──────────────────────────────────────────────────────────────

test('奖励状态只有可用 / 已使用两种', () => {
  assert.equal(rewardState(reward('P10_OFF', { used_at: '2026-09-20T10:00:00Z' })), 'used')
  assert.equal(rewardState(reward('P20_OFF')), 'available')
})

test('已用的奖励标成不可用，但列表仍保留', () => {
  const list = rewardAvailabilityList([reward('P10_OFF'), reward('P20_OFF', { used_at: '2026-09-20T10:00:00Z' })])
  assert.equal(list.length, 2)
  assert.deepEqual(list.map(r => r.state), ['available', 'used'])
})

test('同类多张时挑最早解锁的那张，与 SQL 的排序一致', () => {
  const older = reward('P10_OFF', { reward_id: 'reward-a', unlocked_at: '2026-09-01T10:00:00Z' })
  const newer = reward('P10_OFF', { reward_id: 'reward-b', unlocked_at: '2026-09-05T10:00:00Z' })
  assert.equal(pickRewardForUse([newer, older], 'P10_OFF')?.reward_id, 'reward-a')
})

test('挑券时跳过已用的', () => {
  const used = reward('P10_OFF', { reward_id: 'reward-a', used_at: '2026-09-20T10:00:00Z' })
  const ok = reward('P10_OFF', { reward_id: 'reward-b' })
  assert.equal(pickRewardForUse([used, ok], 'P10_OFF')?.reward_id, 'reward-b')
})

test('结算台可选奖励去重后按类型给出', () => {
  const rewards = [
    reward('P10_OFF', { reward_id: 'reward-a' }),
    reward('P10_OFF', { reward_id: 'reward-b', cycle_index: 2 }),
    reward('P20_OFF', { reward_id: 'reward-c' }),
    reward('P50_OFF', { reward_id: 'reward-d', used_at: '2026-09-20T10:00:00Z' }),
  ]
  assert.deepEqual(usableRewardTypes(rewards), ['P10_OFF', 'P20_OFF'])
})

// ── 折扣计算 ────────────────────────────────────────────────────────────────

test('四档折扣金额按分四舍五入（以 £13.99 = 1399p 为例）', () => {
  const cases: [RewardType, number, number][] = [
    // 折 10% → 减 140p → 付 £12.59
    ['P10_OFF', 140, 12.59],
    // 折 20% → 减 280p → 付 £11.19
    ['P20_OFF', 280, 11.19],
    // 折 30% → 减 420p → 付 £9.79
    ['P30_OFF', 420, 9.79],
    // 折 50% → 减 700p → 付 £6.99
    ['P50_OFF', 700, 6.99],
  ]
  for (const [type, discountPence, finalGbp] of cases) {
    const computed = computeMemberDiscount('member_reward', { amountGbp: 13.99, rewardType: type })
    assert.equal(computed.ok, true, `${type} 应该算得出折扣`)
    if (!computed.ok) continue
    assert.equal(computed.preview.discountValue, REWARD_DISCOUNT_PERCENT[type])
    assert.equal(computed.preview.discountType, 'percentage_off')
    assert.equal(computed.preview.discountAmountPence, discountPence)
    assert.equal(computed.preview.finalGbp, finalGbp)
  }
})

test('percentOffPence 与 SQL 的 ROUND(原价 pence × 百分比 / 100) 同口径', () => {
  assert.equal(percentOffPence(1399, 10), 140)
  assert.equal(percentOffPence(1399, 20), 280)
  assert.equal(percentOffPence(1399, 30), 420)
  assert.equal(percentOffPence(1399, 50), 700)
  assert.equal(percentOffPence(100, 50), 50)
})

test('折扣金额跟着仓库真实定价走', () => {
  const bill = calcBill(150)
  const p50 = computeMemberDiscount('member_reward', { amountGbp: bill.totalGbp, rewardType: 'P50_OFF' })
  assert.equal(p50.ok, true)
  if (!p50.ok) return
  assert.equal(p50.preview.discountAmountPence, Math.round(bill.totalGbp * 100 * 50 / 100))
  assert.equal(p50.preview.preDiscountGbp, bill.totalGbp)
})

test('不打折时金额原样返回', () => {
  const none = computeMemberDiscount('none', { amountGbp: 25.99 })
  assert.equal(none.ok && none.preview.discountAmountPence, 0)
  assert.equal(none.ok && none.preview.finalGbp, 25.99)
})

test('会员奖励的入参校验', () => {
  assert.deepEqual(
    computeMemberDiscount('member_reward', { amountGbp: 13.99 }),
    { ok: false, error: 'REWARD_TYPE_INVALID' },
  )
  assert.deepEqual(
    computeMemberDiscount('member_reward', { amountGbp: 13.99, rewardType: null }),
    { ok: false, error: 'REWARD_TYPE_INVALID' },
  )
  assert.deepEqual(
    computeMemberDiscount('none', { amountGbp: null }),
    { ok: false, error: 'SESSION_AMOUNT_MISSING' },
  )
  assert.deepEqual(
    computeMemberDiscount('coupon', { amountGbp: 13.99 }),
    { ok: false, error: 'COUPON_SOURCE_NOT_HANDLED' },
  )
  assert.deepEqual(
    computeMemberDiscount('bogus' as never, { amountGbp: 13.99 }),
    { ok: false, error: 'DISCOUNT_SOURCE_INVALID' },
  )
})
