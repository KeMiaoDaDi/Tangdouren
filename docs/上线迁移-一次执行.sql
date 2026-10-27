-- ============================================================================
-- Tangdouren Club 会员系统：上线迁移（一次执行版）
--
-- 用法：把本文件全部内容粘进 Supabase Dashboard 的 SQL Editor，按 Run 执行。
--       执行过程会弹一次「destructive operations」提醒（因为里面有 DROP FUNCTION
--       和 DROP CONSTRAINT），那是先删后建的正常写法，点 Run query 继续。
--       看到 Success. No rows returned 即成功。
--
-- 本文件 = supabase/migrations/016_members.sql + 017_member_settlement.sql + 018_member_threshold_discount.sql
-- 顺序不能反：017 依赖 016 建的表和列，018 依赖 017 建的函数与视图。三个文件都是可重复执行的。
-- 执行完可用 docs/verify_member_system.sql（21 项）或 docs/verify_via_api.py（29 项）复验。
-- ============================================================================

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 第 1 段 / 共 3 段：016_members.sql                                        │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ============================================================
-- Tangdouren Club 会员系统 v1.2 — 第 1 步：会员主表与消费归属
--
-- 范围：
--   1) 新建 members 表（会员身份 + 加入同意记录）
--   2) timer_sessions 增加 member_id（消费归属）与 reward_eligible（结算进度资格）
--   3) RLS：与 timer_sessions 一致，全部走 service role
--
-- 说明：
--   1) 会员以邮箱为自然键。email 保留顾客原始输入，email_key 存
--      lower(btrim(email)) 并做唯一键，避免大小写 / 空格造出同一个人两条记录。
--   2) 不生成会员码。现场识别由店员在结算台按邮箱或姓名搜索会员完成。
--   3) Visit 不落计数器，由「有会员归属且已结算」的订单派生
--      （视图 member_visit_days 建在 017）。
--   4) 删除会员的处理方式：删除 members 行，member_id 经 ON DELETE SET NULL
--      自动断开，订单与金额保留不动（对应 UK GDPR 的删除请求）。
--   5) bookings 不加 member_id：预约上的会员身份不自动传递到 timer session，
--      预约邮箱只用于后台标注「这个人已经是会员」，因此只给 bookings.email
--      加一条规范化索引。
-- ============================================================

-- ── 1. members ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS members (
  member_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text        NOT NULL,               -- 顾客原始输入
  email_key      text        NOT NULL,               -- lower(btrim(email))，唯一键
  display_name   text,                               -- 姓名，供结算台搜索与展示
  joined_at      timestamptz NOT NULL DEFAULT NOW(), -- 加入会员时刻
  consent_at     timestamptz NOT NULL DEFAULT NOW(), -- 同意加入的时刻（留证）
  consent_source text        NOT NULL,               -- booking | in_store
  note           text,                               -- 店员备注
  is_active      boolean     NOT NULL DEFAULT true   -- 退会置 false，不删记录
);

-- 邮箱形状：必须有 @ 且 @ 后要有域名点号
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_email_shape_check;
ALTER TABLE members ADD CONSTRAINT members_email_shape_check
  CHECK (
    position('@' IN email) > 1
    AND position('.' IN split_part(email, '@', 2)) > 1
  );

-- email_key 必须真的是 email 的小写去空格形式，防止某条写入路径漏规范化
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_email_key_check;
ALTER TABLE members ADD CONSTRAINT members_email_key_check
  CHECK (email_key = lower(btrim(email)) AND btrim(email_key) <> '');

-- 同意来源只能是这两个入口（预约页勾选 / 门店登记）
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_consent_source_check;
ALTER TABLE members ADD CONSTRAINT members_consent_source_check
  CHECK (consent_source IN ('booking', 'in_store'));

-- 一个邮箱一个人
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email_key ON members(email_key);

CREATE INDEX IF NOT EXISTS idx_members_joined_at   ON members(joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_name_lookup ON members(lower(display_name));

-- RLS：与 014 对 timer_sessions 的处理一致 —— 只启用、不建策略。
-- 应用访问全部走 service role（lib/supabase/admin.ts），anon / authenticated
-- 拿公开的 publishable key 读不到任何会员数据。
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- ── 2. 消费归属字段 ──────────────────────────────────────────────────────────

-- 到店消费的归属：会员在自助计时页以会员身份开始时写入，或由店员在结算台补 Link
ALTER TABLE timer_sessions
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(member_id) ON DELETE SET NULL;

-- 本次消费是否计入 Reward Progress，在结算时固化，不在查询时按日期重推：
--   true  = 有会员归属，且是会员本人正常结算的单
--   false = 不计入（后台把已结算的散客单补挂到会员名下，只计 Lifetime）
--   NULL  = 尚未判定（未结算的订单、以及本迁移之前的历史订单）
-- 之所以固化而不是现算：后台补挂的历史订单事后按日期重推，会把
-- 那些散客消费一起误计进 Reward Progress。
ALTER TABLE timer_sessions
  ADD COLUMN IF NOT EXISTS reward_eligible boolean;

-- 只有归属到会员的单才可能计入奖励进度，防止某条写入路径把 true 写到散客单上
ALTER TABLE timer_sessions DROP CONSTRAINT IF EXISTS timer_sessions_reward_eligible_check;
ALTER TABLE timer_sessions ADD CONSTRAINT timer_sessions_reward_eligible_check
  CHECK (reward_eligible IS NOT TRUE OR member_id IS NOT NULL);

-- Visit 与 Reward Progress 都按 (member_id, is_settled) 过滤，这条索引直接服务该查询
CREATE INDEX IF NOT EXISTS idx_timer_sessions_member ON timer_sessions(member_id, is_settled);

-- 预约时按邮箱认会员，查询对大小写与首尾空格不敏感
CREATE INDEX IF NOT EXISTS idx_bookings_email_key    ON bookings(lower(btrim(email)));

-- ============================================================
-- ROLLBACK：
--   DROP INDEX IF EXISTS idx_bookings_email_key;
--   DROP INDEX IF EXISTS idx_timer_sessions_member;
--   ALTER TABLE timer_sessions DROP CONSTRAINT IF EXISTS timer_sessions_reward_eligible_check;
--   ALTER TABLE timer_sessions DROP COLUMN IF EXISTS reward_eligible;
--   ALTER TABLE timer_sessions DROP COLUMN IF EXISTS member_id;
--   DROP TABLE IF EXISTS members;
-- ============================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 第 2 段 / 共 3 段：017_member_settlement.sql                              │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- NOTE: the head of this file is kept ASCII-only on purpose.
-- Tooling that sniffs the first 8192 bytes as UTF-8 misreads a file whose
-- multibyte characters straddle that boundary. Do not reorder this header
-- without re-checking that the file is still seen as text.
-- ============================================================
-- Tangdouren Club 会员系统 v1.3 — 第 3 步：奖励引擎与结算接入
-- 依据：《Tangdouren Club 会员系统 PRD v1》第 6、7、9、10、11、18、19、20、21 节
--
-- 范围：
--   1) 新表 member_rewards（奖励解锁与核销）
--   2) 新视图 member_visit_days（Lifetime Visits 与 Reward Progress 的唯一口径）
--   3) 新函数 ensure_member_rewards()
--   4) 扩展 settle_timer_session / unsettle_timer_session，接入会员折扣
--   5) 后台动作函数 link_timer_session_to_member()
--
-- 设计要点：
--   1) 进度不落计数器。Lifetime Visits = 会员已结算订单的伦敦日期去重计数；
--      Reward Progress = 同样的计数但只认 reward_eligible 为真的访日（PRD 20）。
--   2) 解锁幂等靠 UNIQUE(member_id, reward_type, cycle_index) + ON CONFLICT DO NOTHING，
--      重复结算或并发调用都不会多发一张（PRD 19.3）。
--   3) 折扣来源是单选枚举（none / coupon / member_reward），从结构上排除叠加（PRD 21）。
--   4) 金额仍由 TypeScript 先算（lib/member/member.ts），SQL 用自己查到的奖励记录复核，
--      对不上抛错。**改动折扣逻辑必须同时改这两处**，否则会出现预览金额与最终结算不一致。
--   5) 奖励机制（2026-10 改版）：每 10 个 Reward-eligible Visit 为一轮，到第
--      3 / 5 / 7 / 10 次各解锁一张一次性百分比折扣奖励（9 折 / 8 折 / 7 折 / 5 折），
--      核销一次即用掉，只限本人订单，不可转赠。
--   6) 已结算的散客单允许在后台补挂到会员名下，只记到店次数，不追折扣、不补发奖励。
-- ============================================================

-- 生产库尚未执行旧版迁移；测试库若已跑过 v1.2，这里把旧的 VIP / 券类对象一并清掉，
-- 保证迁移可重复执行（幂等）。
DROP FUNCTION IF EXISTS public.member_vip_active(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.activate_member_vip(UUID, TEXT);
DROP TABLE IF EXISTS member_benefits;

-- ── 1. member_rewards ────────────────────────────────────────────────────────
-- 一条记录 = 一张已经解锁的奖励。四档奖励都是「本人订单的百分比折扣」，不挂券、不转赠。

CREATE TABLE IF NOT EXISTS member_rewards (
  reward_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id              uuid        NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  reward_type            text        NOT NULL,
  cycle_index            integer     NOT NULL,
  unlocked_at            timestamptz NOT NULL DEFAULT NOW(),
  unlocked_by_session_id text        REFERENCES timer_sessions(session_id) ON DELETE SET NULL,
  used_at                timestamptz,
  used_by                text,
  used_session_id        text        REFERENCES timer_sessions(session_id) ON DELETE RESTRICT
);

-- v1.2 遗留：coupon_id 列及其 CHECK 依赖它，先卸约束再删列
ALTER TABLE member_rewards DROP CONSTRAINT IF EXISTS member_rewards_coupon_check;
ALTER TABLE member_rewards DROP CONSTRAINT IF EXISTS member_rewards_friend_transfer_check;
ALTER TABLE member_rewards DROP COLUMN IF EXISTS coupon_id;

ALTER TABLE member_rewards DROP CONSTRAINT IF EXISTS member_rewards_type_check;
ALTER TABLE member_rewards ADD CONSTRAINT member_rewards_type_check
  CHECK (reward_type IN ('P10_OFF', 'P20_OFF', 'P30_OFF', 'P50_OFF'));

-- 轮次从 1 开始（判定式 10 ×(轮次 - 1) + 档位）
ALTER TABLE member_rewards DROP CONSTRAINT IF EXISTS member_rewards_cycle_check;
ALTER TABLE member_rewards ADD CONSTRAINT member_rewards_cycle_check
  CHECK (cycle_index >= 1);

-- 核销字段要么全空，要么成组出现（与 coupons 的处理一致）
ALTER TABLE member_rewards DROP CONSTRAINT IF EXISTS member_rewards_used_check;
ALTER TABLE member_rewards ADD CONSTRAINT member_rewards_used_check
  CHECK (
    (used_at IS NULL     AND used_by IS NULL     AND used_session_id IS NULL)
    OR
    (used_at IS NOT NULL AND used_by IS NOT NULL AND used_session_id IS NOT NULL)
  );

-- 解锁幂等：同一会员同一轮同一档位只可能有一条
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_rewards_idempotent
  ON member_rewards(member_id, reward_type, cycle_index);

-- 结算台挑券：按会员 + 类型找「最早解锁且未使用」的一张
CREATE INDEX IF NOT EXISTS idx_member_rewards_available
  ON member_rewards(member_id, reward_type, used_at);

-- 撤销结算要能反查「这一单解锁了哪些奖励」「这一单用了哪张奖励」
CREATE INDEX IF NOT EXISTS idx_member_rewards_unlocked_by
  ON member_rewards(unlocked_by_session_id) WHERE unlocked_by_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_rewards_used_session
  ON member_rewards(used_session_id) WHERE used_session_id IS NOT NULL;

-- RLS：照 014 / 016 的处理，只启用、不建策略，应用全走 service role
ALTER TABLE member_rewards ENABLE ROW LEVEL SECURITY;

-- ── 2. 口径视图 ──────────────────────────────────────────────────────────────

-- Visit 口径（PRD 20）：
--   Lifetime Visits = 本视图行数
--   Reward Progress = 本视图 reward_eligible 为真的行数
-- 同一会员同一天的多条已结算订单合并成一行；当天只要有一条订单被判定计入进度，
-- 这一天就算进度的。
DROP VIEW IF EXISTS public.member_visit_days;
CREATE VIEW public.member_visit_days
WITH (security_invoker = true) AS
SELECT
  member_id,
  (started_at AT TIME ZONE 'Europe/London')::date AS visit_date,
  bool_or(COALESCE(reward_eligible, false))       AS reward_eligible
FROM timer_sessions
WHERE member_id IS NOT NULL
  AND is_settled
GROUP BY 1, 2;

REVOKE ALL ON public.member_visit_days FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.member_visit_days FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.member_visit_days FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT ON public.member_visit_days TO service_role';
  END IF;
END $$;

-- ── 3. 解锁奖励（幂等）───────────────────────────────────────────────────────
-- 按当前 Reward Progress 把所有该解锁的奖励补齐，已存在的跳过。
-- 第 2 轮及以后靠「10 ×(轮次 - 1) + 档位」自动落在 13 / 15 / 17 / 20。

CREATE OR REPLACE FUNCTION public.ensure_member_rewards(
  p_member_id  uuid,
  p_session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress    integer;
  v_cycle       integer;
  v_node        integer;
  v_reward_type text;
  v_reward_id   uuid;
  v_inserted    uuid;
  v_new         jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE member_id = p_member_id) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_progress
    FROM member_visit_days
   WHERE member_id = p_member_id
     AND reward_eligible;

  IF v_progress > 0 THEN
    FOR v_cycle IN 1 .. ((v_progress - 1) / 10 + 1) LOOP
      FOR v_node, v_reward_type IN
        SELECT * FROM (VALUES
          (3,  'P10_OFF'),
          (5,  'P20_OFF'),
          (7,  'P30_OFF'),
          (10, 'P50_OFF')
        ) AS t(node, reward_type)
      LOOP
        CONTINUE WHEN v_progress < 10 * (v_cycle - 1) + v_node;

        v_reward_id := gen_random_uuid();
        v_inserted := NULL;

        INSERT INTO member_rewards (
          reward_id, member_id, reward_type, cycle_index, unlocked_by_session_id
        )
        VALUES (
          v_reward_id, p_member_id, v_reward_type, v_cycle, p_session_id
        )
        ON CONFLICT (member_id, reward_type, cycle_index) DO NOTHING
        RETURNING reward_id INTO v_inserted;

        -- 已存在（重复调用或并发）：幂等跳过
        IF v_inserted IS NULL THEN
          CONTINUE;
        END IF;

        v_new := v_new || jsonb_build_object('reward_type', v_reward_type, 'cycle_index', v_cycle);
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'progress',  v_progress,
    'unlocked',  v_new
  );
END;
$$;

-- ── 4. 结算：接入会员折扣 ────────────────────────────────────────────────────
-- 旧的 5 参数版本必须删掉：新版本带默认值，留着两个会构成重载，
-- 调用 5 个参数时 PostgreSQL 无法判断用哪一个。删除后原调用方式照常工作。
DROP FUNCTION IF EXISTS public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.settle_timer_session(
  p_session_id            TEXT,
  p_settled_by            TEXT,
  p_settlement_note       TEXT    DEFAULT NULL,
  p_coupon_code           TEXT    DEFAULT NULL,
  p_discount_amount_pence INTEGER DEFAULT NULL,
  p_discount_source       TEXT    DEFAULT 'none',
  p_member_id             UUID    DEFAULT NULL,
  p_reward_type           TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session         timer_sessions%ROWTYPE;
  v_coupon          coupons%ROWTYPE;
  v_reward          member_rewards%ROWTYPE;
  v_code            TEXT;
  v_source          TEXT;
  v_pre_pence       INTEGER;
  v_expect          INTEGER;
  v_final_pence     INTEGER;
  v_reward_eligible BOOLEAN;
BEGIN
  -- 1. 锁定订单
  SELECT * INTO v_session FROM timer_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'SESSION_NOT_COMPLETED' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.is_settled THEN
    RAISE EXCEPTION 'SESSION_ALREADY_SETTLED' USING ERRCODE = 'P0001';
  END IF;

  v_pre_pence := COALESCE(ROUND(v_session.amount_gbp * 100)::INTEGER, 0);

  -- 2. 折扣来源归一（PRD 21：一次结算只允许一个折扣来源）
  v_source := COALESCE(NULLIF(btrim(COALESCE(p_discount_source, '')), ''), 'none');
  IF v_source NOT IN ('none', 'coupon', 'member_reward') THEN
    RAISE EXCEPTION 'DISCOUNT_SOURCE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 传了券码就是券折扣（兼容旧调用方只传券码的写法）
  IF btrim(COALESCE(p_coupon_code, '')) <> '' AND v_source = 'none' THEN
    v_source := 'coupon';
  END IF;
  IF v_source = 'coupon' AND btrim(COALESCE(p_coupon_code, '')) = '' THEN
    RAISE EXCEPTION 'COUPON_CODE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_source <> 'coupon' AND btrim(COALESCE(p_coupon_code, '')) <> '' THEN
    RAISE EXCEPTION 'MULTIPLE_DISCOUNT_SOURCES' USING ERRCODE = 'P0001';
  END IF;

  -- 3. 按来源计算并复核折扣金额
  IF v_source = 'none' THEN
    v_expect := 0;

  ELSIF v_source = 'coupon' THEN
    v_code := upper(btrim(p_coupon_code));
    SELECT * INTO v_coupon FROM coupons WHERE code = v_code FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_coupon.redeemed_at IS NOT NULL THEN
      RAISE EXCEPTION 'COUPON_ALREADY_USED' USING ERRCODE = 'P0001';
    END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
      RAISE EXCEPTION 'COUPON_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM coupons
       WHERE redeemed_session_id = p_session_id AND coupon_id <> v_coupon.coupon_id
    ) THEN
      RAISE EXCEPTION 'SESSION_ALREADY_HAS_COUPON' USING ERRCODE = 'P0001';
    END IF;

    IF p_discount_amount_pence IS NULL THEN
      RAISE EXCEPTION 'COUPON_DISCOUNT_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_coupon.discount_type = 'fixed_amount' THEN
      v_expect := LEAST(ROUND(v_coupon.discount_value * 100)::INTEGER, v_pre_pence);
    ELSIF v_coupon.discount_type = 'percentage_off' THEN
      v_expect := ROUND(v_pre_pence * v_coupon.discount_value / 100)::INTEGER;
    ELSE  -- time_minutes：首小时不可减免，优惠金额由服务端按定价常量计算
      IF v_session.billing_minutes IS NULL OR v_session.billing_minutes <= 60 THEN
        RAISE EXCEPTION 'COUPON_TIME_NOT_APPLICABLE' USING ERRCODE = 'P0001';
      END IF;
      v_expect := p_discount_amount_pence;
    END IF;

    IF p_discount_amount_pence <> v_expect THEN
      RAISE EXCEPTION 'COUPON_DISCOUNT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

  ELSE  -- member_reward
    IF p_member_id IS NULL THEN
      RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_reward_type IS NULL OR p_reward_type NOT IN ('P10_OFF', 'P20_OFF', 'P30_OFF', 'P50_OFF') THEN
      RAISE EXCEPTION 'REWARD_TYPE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    -- 所有奖励都只限本人订单（PRD 10.1；忘了以会员身份计时的先用后台 Link to Member）
    IF v_session.member_id IS DISTINCT FROM p_member_id THEN
      RAISE EXCEPTION 'MEMBER_SESSION_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    -- 挑「最早解锁且未使用」的一张同类奖励。
    -- 排除本单自己解锁出来的那张，保证刚解锁的奖励不能用于产生它的这笔消费（PRD 8）。
    SELECT * INTO v_reward
      FROM member_rewards
     WHERE member_id = p_member_id
       AND reward_type = p_reward_type
       AND used_at IS NULL
       AND (unlocked_by_session_id IS NULL OR unlocked_by_session_id <> p_session_id)
     ORDER BY unlocked_at, reward_id
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'MEMBER_REWARD_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    IF p_discount_amount_pence IS NULL THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_MISSING' USING ERRCODE = 'P0001';
    END IF;

    -- 四档百分比折扣：9 折 / 8 折 / 7 折 / 5 折（off 10% / 20% / 30% / 50%）
    IF p_reward_type = 'P10_OFF' THEN
      v_expect := ROUND(v_pre_pence * 10::numeric / 100)::INTEGER;
    ELSIF p_reward_type = 'P20_OFF' THEN
      v_expect := ROUND(v_pre_pence * 20::numeric / 100)::INTEGER;
    ELSIF p_reward_type = 'P30_OFF' THEN
      v_expect := ROUND(v_pre_pence * 30::numeric / 100)::INTEGER;
    ELSE  -- P50_OFF
      v_expect := ROUND(v_pre_pence * 50::numeric / 100)::INTEGER;
    END IF;

    IF p_discount_amount_pence <> v_expect THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_final_pence := v_pre_pence - v_expect;
  IF v_expect < 0 OR v_final_pence < 0 THEN
    RAISE EXCEPTION 'DISCOUNT_AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 4. 固化本次消费是否计入 Reward Progress（PRD 19.2）。
  --    散客单不判定，留 NULL；会员单一律计入。
  --    false 只有一个来源：后台把已结算的散客单补挂到会员名下（见第 6 节），
  --    那一单只算 Lifetime Visits、不走进度。
  IF v_session.member_id IS NULL THEN
    v_reward_eligible := NULL;
  ELSE
    v_reward_eligible := TRUE;
  END IF;

  -- 5. 写结算（折扣快照列沿用 013 的字段；会员奖励不挂券，快照只记折扣百分比）
  UPDATE timer_sessions SET
    is_settled                 = TRUE,
    actual_amount_gbp          = ROUND(v_final_pence / 100.0, 2),
    settlement_note            = p_settlement_note,
    settled_at                 = NOW(),
    settled_by                 = p_settled_by,
    reward_eligible            = v_reward_eligible,
    coupon_id                  = CASE WHEN v_source = 'coupon' THEN v_coupon.coupon_id ELSE NULL END,
    coupon_code_snapshot       = CASE WHEN v_source = 'coupon' THEN v_coupon.code ELSE NULL END,
    discount_type_snapshot     = CASE v_source
                                   WHEN 'coupon'        THEN v_coupon.discount_type
                                   WHEN 'member_reward' THEN 'percentage_off'
                                   ELSE NULL
                                 END,
    discount_value_snapshot    = CASE v_source
                                   WHEN 'coupon'        THEN v_coupon.discount_value
                                   WHEN 'member_reward' THEN CASE v_reward.reward_type
                                                              WHEN 'P10_OFF' THEN 10.00
                                                              WHEN 'P20_OFF' THEN 20.00
                                                              WHEN 'P30_OFF' THEN 30.00
                                                              ELSE 50.00
                                                            END
                                   ELSE NULL
                                 END,
    discount_amount_gbp        = ROUND(v_expect / 100.0, 2),
    pre_discount_amount_gbp    = v_session.amount_gbp,
    discounted_billing_minutes = NULL
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  -- 6. 核销：普通券，或会员奖励
  IF v_source = 'coupon' THEN
    UPDATE coupons SET
      redeemed_at         = NOW(),
      redeemed_by         = p_settled_by,
      redeemed_session_id = p_session_id
    WHERE coupon_id = v_coupon.coupon_id;

  ELSIF v_source = 'member_reward' THEN
    UPDATE member_rewards SET
      used_at         = NOW(),
      used_by         = p_settled_by,
      used_session_id = p_session_id
    WHERE reward_id = v_reward.reward_id;
  END IF;

  -- 7. 结算落库之后才解锁新奖励：本单用不到刚解锁出来的奖励（PRD 8）
  IF v_session.member_id IS NOT NULL THEN
    PERFORM ensure_member_rewards(v_session.member_id, p_session_id);
  END IF;

  RETURN to_jsonb(v_session);
END;
$$;

-- ── 5. 撤销结算：会员奖励的回退 ───────────────────────────────────────────────
-- 全部检查放在动手之前，避免半途报错留下半截状态（PRD 18）。

CREATE OR REPLACE FUNCTION public.unsettle_timer_session(
  p_session_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session timer_sessions%ROWTYPE;
  v_coupon  coupons%ROWTYPE;
  v_blocked INTEGER;
BEGIN
  SELECT * INTO v_session FROM timer_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_session.is_settled THEN
    RAISE EXCEPTION 'SESSION_NOT_SETTLED' USING ERRCODE = 'P0001';
  END IF;

  -- 本单解锁出来的奖励，只要有一张已经被用掉，普通店员撤不了
  SELECT count(*) INTO v_blocked
    FROM member_rewards
   WHERE unlocked_by_session_id = p_session_id
     AND used_at IS NOT NULL;
  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'REWARD_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  -- 恢复该单核销掉的普通券（仅当该券确实由本单核销）
  IF v_session.coupon_id IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE coupon_id = v_session.coupon_id FOR UPDATE;
    IF FOUND THEN
      IF v_coupon.redeemed_session_id IS DISTINCT FROM p_session_id OR v_coupon.redeemed_at IS NULL THEN
        RAISE EXCEPTION 'COUPON_REDEMPTION_MISMATCH' USING ERRCODE = 'P0001';
      END IF;
      UPDATE coupons SET
        redeemed_at         = NULL,
        redeemed_by         = NULL,
        redeemed_session_id = NULL
      WHERE coupon_id = v_coupon.coupon_id;
    END IF;
  END IF;

  -- 本单消费掉的会员奖励退回未使用（PRD 24 验收项）
  UPDATE member_rewards SET
    used_at         = NULL,
    used_by         = NULL,
    used_session_id = NULL
  WHERE used_session_id = p_session_id;

  -- 回退本单解锁出来且尚未用掉的奖励
  DELETE FROM member_rewards
   WHERE unlocked_by_session_id = p_session_id
     AND used_at IS NULL;

  -- 清空结算字段与进度资格
  UPDATE timer_sessions SET
    is_settled                 = FALSE,
    actual_amount_gbp          = NULL,
    actual_amount_cny          = NULL,
    settlement_note            = NULL,
    settled_at                 = NULL,
    settled_by                 = NULL,
    reward_eligible            = NULL,
    coupon_id                  = NULL,
    coupon_code_snapshot       = NULL,
    discount_type_snapshot     = NULL,
    discount_value_snapshot    = NULL,
    discount_amount_gbp        = 0,
    pre_discount_amount_gbp    = NULL,
    discounted_billing_minutes = NULL
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

-- ── 6. 后台动作：把订单关联到会员 ─────────────────────────────────────────────

-- 顾客以散客身份开始计时后才想起自己是会员时，店员在后台把订单挂到会员名下（PRD 5.2）。
-- 已结算的单也允许补挂，但只补「这一单是他来的」，不追折扣、不补发奖励、不动已收金额，
-- 所以这一单写 reward_eligible = false，只进 Lifetime Visits、不进 Reward Progress。
-- 守两条线：① 已归属到别的会员的单不再改归属，否则等于把一次到店从甲挪到乙；
--           ② 未结算的单挂上后 reward_eligible 留 NULL，等结算时按会员单判定。
CREATE OR REPLACE FUNCTION public.link_timer_session_to_member(
  p_session_id text,
  p_member_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session timer_sessions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE member_id = p_member_id AND is_active) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session FROM timer_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  -- 已结算的单只允许「补挂」，不允许改归属
  IF v_session.is_settled
     AND v_session.member_id IS NOT NULL
     AND v_session.member_id IS DISTINCT FROM p_member_id THEN
    RAISE EXCEPTION 'SESSION_ALREADY_LINKED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE timer_sessions SET
    member_id       = p_member_id,
    -- 未结算的等结算时判定；已结算的补挂只记「他来过」，不计进度
    reward_eligible = CASE WHEN v_session.is_settled THEN FALSE ELSE NULL END
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

-- ── 7. 权限：仅 service role 可执行 ──────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT) TO service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.unsettle_timer_session(TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.unsettle_timer_session(TEXT) TO service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_member_rewards(UUID, TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_member_rewards(UUID, TEXT) TO service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.link_timer_session_to_member(TEXT, UUID) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.link_timer_session_to_member(TEXT, UUID) TO service_role';
  END IF;
END $$;

-- ============================================================
-- ROLLBACK：
--   先恢复 013 版本的 settle_timer_session（无会员参数），再执行下面这些。
--   DROP FUNCTION IF EXISTS public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.ensure_member_rewards(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.link_timer_session_to_member(TEXT, UUID);
--   DROP VIEW  IF EXISTS public.member_visit_days;
--   DROP TABLE IF EXISTS member_rewards;
--   ALTER TABLE timer_sessions DROP COLUMN IF EXISTS reward_eligible;   -- 见 016
--   注意：回滚不会恢复已被 017 删除的历史奖励记录。
-- ============================================================

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 第 3 段 / 共 3 段：018_member_threshold_discount.sql                      │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ============================================================
-- Tangdouren Club 会员系统 v1.4 — 到店达标自动打折
-- 依据：业主 2026-10 改版口径「不存券，达到次数的那一单自动打折」
--
-- 相对 v1.3 的变化：
--   1) 删除 member_rewards 表与 ensure_member_rewards()：奖励不再落库成
--      「可稍后核销的券」，折扣完全由「结算那一刻的累计到店次数」推导。
--   2) timer_sessions 新增 discount_source_snapshot（coupon | member | NULL），
--      用于到店记录里标注这一单享了哪种优惠。
--   3) settle_timer_session 改为：结算有会员归属的订单时，自动判断这一单是否
--      「当天第一笔计入进度」且累计 Progress 恰好落到档位（3/5/7/10/13/…），
--      是则按对应百分比折扣结算，其余原价。与优惠券互斥。
--   4) unsettle_timer_session 去掉对 member_rewards 的回退，改为清快照字段。
--
-- 口径（与 lib/member/member.ts、lib/member/service.ts 同口径）：
--   - Reward Progress = member_visit_days 里 reward_eligible 为真的访日数。
--   - 「当天第一笔」= 该会员在同一伦敦日期还没有 reward_eligible 的访日。
--   - 折扣金额 = ROUND(原价 pence × 百分比 / 100)，由 TypeScript 先算，
--     SQL 再复核，对不上抛错。
-- ============================================================

-- ── 1. 清理旧的奖励表与解锁函数 ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.ensure_member_rewards(UUID, TEXT);
DROP TABLE IF EXISTS member_rewards;

-- ── 2. 优惠来源快照列 ────────────────────────────────────────────────────────

ALTER TABLE timer_sessions
  ADD COLUMN IF NOT EXISTS discount_source_snapshot TEXT;

-- 回填存量（仅测试库有旧数据；生产库本迁移前为空）
--   coupon_id 非空 → coupon；无券但 percentage_off 的 → member（旧版会员奖励）
UPDATE timer_sessions SET discount_source_snapshot = CASE
  WHEN coupon_id IS NOT NULL THEN 'coupon'
  WHEN coupon_id IS NULL AND discount_type_snapshot = 'percentage_off' THEN 'member'
  ELSE NULL
END
WHERE discount_source_snapshot IS NULL;

-- ── 3. 结算：达标自动打折 ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.settle_timer_session(
  p_session_id            TEXT,
  p_settled_by            TEXT,
  p_settlement_note       TEXT    DEFAULT NULL,
  p_coupon_code           TEXT    DEFAULT NULL,
  p_discount_amount_pence INTEGER DEFAULT NULL,
  p_discount_source       TEXT    DEFAULT 'none',
  p_member_id             UUID    DEFAULT NULL,
  p_reward_type           TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session          timer_sessions%ROWTYPE;
  v_coupon           coupons%ROWTYPE;
  v_code             TEXT;
  v_source           TEXT;
  v_pre_pence        INTEGER;
  v_expect           INTEGER;
  v_final_pence      INTEGER;
  v_reward_eligible  BOOLEAN;
  v_threshold_type   TEXT;
  v_prior_progress   INTEGER;
  v_has_prior_today  BOOLEAN;
  v_new_progress     INTEGER;
  v_discount_percent NUMERIC;
  v_lock             INTEGER;
BEGIN
  -- 1. 锁定订单
  SELECT * INTO v_session FROM timer_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'SESSION_NOT_COMPLETED' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.is_settled THEN
    RAISE EXCEPTION 'SESSION_ALREADY_SETTLED' USING ERRCODE = 'P0001';
  END IF;

  v_pre_pence := COALESCE(ROUND(v_session.amount_gbp * 100)::INTEGER, 0);

  -- 2. 达标自动折扣判定（有会员归属时）。先锁会员行，串行化同一会员的并发结算，
  --    避免两个订单同时结算都以为自己「当天第一笔」而重复打折。
  v_threshold_type := NULL;
  IF v_session.member_id IS NOT NULL THEN
    SELECT 1 INTO v_lock FROM members WHERE member_id = v_session.member_id FOR UPDATE;

    SELECT count(*) INTO v_prior_progress
      FROM member_visit_days
     WHERE member_id = v_session.member_id
       AND reward_eligible;

    SELECT EXISTS (
      SELECT 1 FROM member_visit_days
       WHERE member_id = v_session.member_id
         AND reward_eligible
         AND visit_date = (v_session.started_at AT TIME ZONE 'Europe/London')::date
    ) INTO v_has_prior_today;

    IF NOT v_has_prior_today THEN
      v_new_progress := v_prior_progress + 1;
      v_threshold_type := CASE (v_new_progress % 10)
        WHEN 3 THEN 'P10_OFF'
        WHEN 5 THEN 'P20_OFF'
        WHEN 7 THEN 'P30_OFF'
        WHEN 0 THEN 'P50_OFF'
        ELSE NULL
      END;
    END IF;
  END IF;

  -- 3. 折扣来源归一（一次结算只允许一个折扣来源）
  v_source := COALESCE(NULLIF(btrim(COALESCE(p_discount_source, '')), ''), 'none');
  IF v_source NOT IN ('none', 'coupon', 'member_reward') THEN
    RAISE EXCEPTION 'DISCOUNT_SOURCE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 传了券码就是券折扣（兼容旧调用方只传券码的写法）
  IF btrim(COALESCE(p_coupon_code, '')) <> '' AND v_source = 'none' THEN
    v_source := 'coupon';
  END IF;
  IF v_source = 'coupon' AND btrim(COALESCE(p_coupon_code, '')) = '' THEN
    RAISE EXCEPTION 'COUPON_CODE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_source <> 'coupon' AND btrim(COALESCE(p_coupon_code, '')) <> '' THEN
    RAISE EXCEPTION 'MULTIPLE_DISCOUNT_SOURCES' USING ERRCODE = 'P0001';
  END IF;

  -- 4. 按来源计算并复核折扣金额
  IF v_source = 'none' THEN
    IF v_threshold_type IS NOT NULL THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    v_expect := 0;

  ELSIF v_source = 'coupon' THEN
    IF v_threshold_type IS NOT NULL THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON' USING ERRCODE = 'P0001';
    END IF;

    v_code := upper(btrim(p_coupon_code));
    SELECT * INTO v_coupon FROM coupons WHERE code = v_code FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_coupon.redeemed_at IS NOT NULL THEN
      RAISE EXCEPTION 'COUPON_ALREADY_USED' USING ERRCODE = 'P0001';
    END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
      RAISE EXCEPTION 'COUPON_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM coupons
       WHERE redeemed_session_id = p_session_id AND coupon_id <> v_coupon.coupon_id
    ) THEN
      RAISE EXCEPTION 'SESSION_ALREADY_HAS_COUPON' USING ERRCODE = 'P0001';
    END IF;

    IF p_discount_amount_pence IS NULL THEN
      RAISE EXCEPTION 'COUPON_DISCOUNT_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_coupon.discount_type = 'fixed_amount' THEN
      v_expect := LEAST(ROUND(v_coupon.discount_value * 100)::INTEGER, v_pre_pence);
    ELSIF v_coupon.discount_type = 'percentage_off' THEN
      v_expect := ROUND(v_pre_pence * v_coupon.discount_value / 100)::INTEGER;
    ELSE  -- time_minutes：首小时不可减免，优惠金额由服务端按定价常量计算
      IF v_session.billing_minutes IS NULL OR v_session.billing_minutes <= 60 THEN
        RAISE EXCEPTION 'COUPON_TIME_NOT_APPLICABLE' USING ERRCODE = 'P0001';
      END IF;
      v_expect := p_discount_amount_pence;
    END IF;

    IF p_discount_amount_pence <> v_expect THEN
      RAISE EXCEPTION 'COUPON_DISCOUNT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

  ELSE  -- member_reward（达标自动折扣）
    IF p_member_id IS NULL THEN
      RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF v_session.member_id IS DISTINCT FROM p_member_id THEN
      RAISE EXCEPTION 'MEMBER_SESSION_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    IF v_threshold_type IS NULL THEN
      RAISE EXCEPTION 'MEMBER_THRESHOLD_NOT_MET' USING ERRCODE = 'P0001';
    END IF;
    IF p_reward_type IS NULL OR p_reward_type <> v_threshold_type THEN
      RAISE EXCEPTION 'REWARD_TYPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_discount_amount_pence IS NULL THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_threshold_type = 'P10_OFF' THEN
      v_discount_percent := 10;
    ELSIF v_threshold_type = 'P20_OFF' THEN
      v_discount_percent := 20;
    ELSIF v_threshold_type = 'P30_OFF' THEN
      v_discount_percent := 30;
    ELSE  -- P50_OFF
      v_discount_percent := 50;
    END IF;

    v_expect := ROUND(v_pre_pence * v_discount_percent / 100)::INTEGER;
    IF p_discount_amount_pence <> v_expect THEN
      RAISE EXCEPTION 'MEMBER_DISCOUNT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_final_pence := v_pre_pence - v_expect;
  IF v_expect < 0 OR v_final_pence < 0 THEN
    RAISE EXCEPTION 'DISCOUNT_AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 5. 固化本次消费是否计入 Reward Progress。
  --    散客单不判定，留 NULL；会员单一律计入。
  IF v_session.member_id IS NULL THEN
    v_reward_eligible := NULL;
  ELSE
    v_reward_eligible := TRUE;
  END IF;

  -- 6. 写结算（优惠快照；会员折扣不挂券，只记折扣百分比与来源）
  UPDATE timer_sessions SET
    is_settled                 = TRUE,
    actual_amount_gbp          = ROUND(v_final_pence / 100.0, 2),
    settlement_note            = p_settlement_note,
    settled_at                 = NOW(),
    settled_by                 = p_settled_by,
    reward_eligible            = v_reward_eligible,
    coupon_id                  = CASE WHEN v_source = 'coupon' THEN v_coupon.coupon_id ELSE NULL END,
    coupon_code_snapshot       = CASE WHEN v_source = 'coupon' THEN v_coupon.code ELSE NULL END,
    discount_source_snapshot   = CASE v_source
                                   WHEN 'coupon'        THEN 'coupon'
                                   WHEN 'member_reward' THEN 'member'
                                   ELSE NULL
                                 END,
    discount_type_snapshot     = CASE v_source
                                   WHEN 'coupon'        THEN v_coupon.discount_type
                                   WHEN 'member_reward' THEN 'percentage_off'
                                   ELSE NULL
                                 END,
    discount_value_snapshot    = CASE v_source
                                   WHEN 'coupon'        THEN v_coupon.discount_value
                                   WHEN 'member_reward' THEN v_discount_percent
                                   ELSE NULL
                                 END,
    discount_amount_gbp        = ROUND(v_expect / 100.0, 2),
    pre_discount_amount_gbp    = v_session.amount_gbp,
    discounted_billing_minutes = NULL
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  -- 7. 核销普通券。会员折扣不需要额外核销动作，折扣已快照在订单上。
  IF v_source = 'coupon' THEN
    UPDATE coupons SET
      redeemed_at         = NOW(),
      redeemed_by         = p_settled_by,
      redeemed_session_id = p_session_id
    WHERE coupon_id = v_coupon.coupon_id;
  END IF;

  RETURN to_jsonb(v_session);
END;
$$;

-- ── 4. 撤销结算 ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unsettle_timer_session(
  p_session_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session timer_sessions%ROWTYPE;
  v_coupon  coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM timer_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_session.is_settled THEN
    RAISE EXCEPTION 'SESSION_NOT_SETTLED' USING ERRCODE = 'P0001';
  END IF;

  -- 恢复该单核销掉的普通券（仅当该券确实由本单核销）
  IF v_session.coupon_id IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE coupon_id = v_session.coupon_id FOR UPDATE;
    IF FOUND THEN
      IF v_coupon.redeemed_session_id IS DISTINCT FROM p_session_id OR v_coupon.redeemed_at IS NULL THEN
        RAISE EXCEPTION 'COUPON_REDEMPTION_MISMATCH' USING ERRCODE = 'P0001';
      END IF;
      UPDATE coupons SET
        redeemed_at         = NULL,
        redeemed_by         = NULL,
        redeemed_session_id = NULL
      WHERE coupon_id = v_coupon.coupon_id;
    END IF;
  END IF;

  -- 清空结算字段、优惠快照与进度资格
  UPDATE timer_sessions SET
    is_settled                 = FALSE,
    actual_amount_gbp          = NULL,
    actual_amount_cny          = NULL,
    settlement_note            = NULL,
    settled_at                 = NULL,
    settled_by                 = NULL,
    reward_eligible            = NULL,
    coupon_id                  = NULL,
    coupon_code_snapshot       = NULL,
    discount_source_snapshot   = NULL,
    discount_type_snapshot     = NULL,
    discount_value_snapshot    = NULL,
    discount_amount_gbp        = 0,
    pre_discount_amount_gbp    = NULL,
    discounted_billing_minutes = NULL
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

-- ── 5. 权限：仅 service role 可执行 ──────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_timer_session(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT) TO service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.unsettle_timer_session(TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.unsettle_timer_session(TEXT) TO service_role';
  END IF;
END $$;

-- ============================================================
-- ROLLBACK：
--   重新执行 017 的会员奖励对象，或从备份恢复。
--   DROP TABLE 之后 member_rewards 的历史奖励记录无法自动恢复。
--   ALTER TABLE timer_sessions DROP COLUMN IF EXISTS discount_source_snapshot;
-- ============================================================
