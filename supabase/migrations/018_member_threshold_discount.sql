--
-- NOTE: the head of this file is kept ASCII-only on purpose.
-- Tooling that sniffs the first 8192 bytes as UTF-8 misreads a file whose
-- multibyte characters straddle that boundary. Do not reorder this header
-- without re-checking that the file is still seen as text.
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
