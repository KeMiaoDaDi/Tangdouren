-- ============================================================
-- 会员系统验收检查：到店达标自动打折（v1.4）
--
-- 全部在一个事务里跑，最后 ROLLBACK：测试库里不会留下任何测试数据。
-- 结果写进临时表 chk，脚本最后 SELECT 出来。
-- ============================================================

BEGIN;

CREATE TEMP TABLE chk (
  编号   serial,
  检查项 text,
  期望   text,
  实际   text,
  结果   text
) ON COMMIT DROP;

DO $verify$
DECLARE
  v_today    date := (NOW() AT TIME ZONE 'Europe/London')::date;
  v_a        uuid;   -- 已有 2 次进度：第 3 次到店应自动 9 折
  v_b        uuid;   -- 已有 2 次进度：用来测「券码冲突」
  v_c        uuid;   -- 已有 1 次进度：下一单不落档，测「门槛未达」
  v_s        text;
  v_s2       text;
  v_cnt      integer;
  v_num      numeric;
  v_txt      text;
  v_bool     boolean;
BEGIN
  ------------------------------------------------------------------
  -- 0. 结构
  ------------------------------------------------------------------
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('members 表存在', 'true',
     (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='members'))::text,
     CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='members') THEN 'PASS' ELSE 'FAIL' END),
    ('member_rewards 表已移除', 'false',
     (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_rewards'))::text,
     CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_rewards') THEN 'PASS' ELSE 'FAIL' END),
    ('member_visit_days 视图存在', 'true',
     (EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='member_visit_days'))::text,
     CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='member_visit_days') THEN 'PASS' ELSE 'FAIL' END),
    ('settle 函数已是 8 参数版', '8',
     (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='settle_timer_session' AND p.pronargs=8),
     CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='settle_timer_session' AND p.pronargs=8) = 1 THEN 'PASS' ELSE 'FAIL' END);

  INSERT INTO chk (检查项, 期望, 实际, 结果)
  SELECT 'timer_sessions.member_id 列存在', 'true', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='timer_sessions' AND column_name='member_id';

  INSERT INTO chk (检查项, 期望, 实际, 结果)
  SELECT 'timer_sessions.reward_eligible 列存在', 'true', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='timer_sessions' AND column_name='reward_eligible';

  INSERT INTO chk (检查项, 期望, 实际, 结果)
  SELECT 'timer_sessions.discount_source_snapshot 列存在', 'true', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='timer_sessions' AND column_name='discount_source_snapshot';

  ------------------------------------------------------------------
  -- 1. 造会员与历史进度
  ------------------------------------------------------------------
  INSERT INTO members (email, email_key, display_name, consent_source)
  VALUES ('hermes.a@example.com', 'hermes.a@example.com', '甲', 'in_store')
  RETURNING member_id INTO v_a;

  INSERT INTO members (email, email_key, display_name, consent_source)
  VALUES ('hermes.b@example.com', 'hermes.b@example.com', '乙', 'in_store')
  RETURNING member_id INTO v_b;

  INSERT INTO members (email, email_key, display_name, consent_source)
  VALUES ('hermes.c@example.com', 'hermes.c@example.com', '丙', 'in_store')
  RETURNING member_id INTO v_c;

  -- 甲：两个不同日期、已结算、计入进度的历史单 → 进度 2
  INSERT INTO timer_sessions (
    session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible
  ) VALUES
    ('HT-A-001', '甲', 'completed', ((v_today - 2)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London', true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_a, true),
    ('HT-A-002', '甲', 'completed', ((v_today - 1)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London', true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_a, true);

  -- 乙：进度 2
  INSERT INTO timer_sessions (
    session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible
  ) VALUES
    ('HT-B-001', '乙', 'completed', ((v_today - 2)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London', true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_b, true),
    ('HT-B-002', '乙', 'completed', ((v_today - 1)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London', true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_b, true);

  -- 丙：进度 1
  INSERT INTO timer_sessions (
    session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible
  ) VALUES (
    'HT-C-001', '丙', 'completed', ((v_today - 1)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London', true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_c, true);

  SELECT count(*) INTO v_cnt FROM member_visit_days WHERE member_id = v_a AND reward_eligible;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('甲的 Reward Progress 为 2', '2', v_cnt::text, CASE WHEN v_cnt = 2 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 2. 达标自动打折：第 3 次到店那单自动 9 折
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-T', '甲', 'completed', ((v_today)::timestamp + interval '10 hours') AT TIME ZONE 'Europe/London',
          false, 60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P10_OFF');

  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('第 3 次到店自动 9 折（13.99 → 12.59）', '12.59', v_num::text, CASE WHEN v_num = 12.59 THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_source_snapshot INTO v_txt FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('折扣来源快照 = member', 'member', v_txt, CASE WHEN v_txt = 'member' THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_value_snapshot INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('折扣值快照 = 10', '10.00', v_num::text, CASE WHEN v_num = 10 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 3. 撤销结算回退进度，重结算仍自动 9 折
  ------------------------------------------------------------------
  PERFORM unsettle_timer_session(v_s);

  SELECT is_settled INTO v_bool FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('撤销后订单回到未结算', 'false', v_bool::text, CASE WHEN v_bool = false THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_source_snapshot INTO v_txt FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('撤销后清空折扣来源快照', NULL::text, v_txt, CASE WHEN v_txt IS NULL THEN 'PASS' ELSE 'FAIL' END);

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P10_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('重结算仍自动 9 折', '12.59', v_num::text, CASE WHEN v_num = 12.59 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 4. 同一天第二笔原价（只打第一笔）
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-T2', '甲', 'completed', ((v_today)::timestamp + interval '14 hours') AT TIME ZONE 'Europe/London',
          false, 60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s2;

  PERFORM settle_timer_session(v_s2, 'hermes_test', NULL, NULL, 0, 'none', NULL, NULL);
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s2;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('同一天第二笔原价', '13.99', v_num::text, CASE WHEN v_num = 13.99 THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_source_snapshot INTO v_txt FROM timer_sessions WHERE session_id = v_s2;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('同一天第二笔无折扣快照', NULL::text, v_txt, CASE WHEN v_txt IS NULL THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 5. 券码冲突：达到档位的那单不能再叠加优惠券
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-B-T', '乙', 'completed', ((v_today)::timestamp + interval '11 hours') AT TIME ZONE 'Europe/London',
          false, 60, 13.99, 'self_service', 'hermes_test', v_b)
  RETURNING session_id INTO v_s;

  BEGIN
    PERFORM settle_timer_session(v_s, 'hermes_test', NULL, 'TD000000', 140, 'coupon', NULL, NULL);
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('达到档位时券码被拒', 'MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON', '居然结算成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('达到档位时券码被拒', 'MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON', SQLERRM,
       CASE WHEN SQLERRM LIKE '%MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  ------------------------------------------------------------------
  -- 6. 门槛未达：非档位次数按会员折扣结算被拒
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-C-T', '丙', 'completed', ((v_today)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London',
          false, 60, 13.99, 'self_service', 'hermes_test', v_c)
  RETURNING session_id INTO v_s;

  BEGIN
    PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_c, 'P10_OFF');
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('不落档的到店按会员折扣结算被拒', 'MEMBER_THRESHOLD_NOT_MET', '居然结算成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('不落档的到店按会员折扣结算被拒', 'MEMBER_THRESHOLD_NOT_MET', SQLERRM,
       CASE WHEN SQLERRM LIKE '%MEMBER_THRESHOLD_NOT_MET%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  ------------------------------------------------------------------
  -- 7. 会员折扣只能用在本人订单上
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-GUEST-1', '散客', 'completed', NOW() - interval '5 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', NULL)
  RETURNING session_id INTO v_s2;

  BEGIN
    PERFORM settle_timer_session(v_s2, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P20_OFF');
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('会员折扣不能用在他人订单上', 'MEMBER_SESSION_MISMATCH', '居然结算成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('会员折扣不能用在他人订单上', 'MEMBER_SESSION_MISMATCH', SQLERRM,
       CASE WHEN SQLERRM LIKE '%MEMBER_SESSION_MISMATCH%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  ------------------------------------------------------------------
  -- 8. 散客单不产生进度（reward_eligible 为 NULL）
  ------------------------------------------------------------------
  PERFORM settle_timer_session(v_s2, 'hermes_test', NULL, NULL, 0, 'none', NULL, NULL);
  SELECT reward_eligible INTO v_txt FROM timer_sessions WHERE session_id = v_s2;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('散客单 reward_eligible 为 NULL', NULL::text, v_txt, CASE WHEN v_txt IS NULL THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 9. 约束守卫：散客单不能标为计入进度
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
      billing_minutes, amount_gbp, created_via, created_by, member_id, reward_eligible)
    VALUES ('HT-BAD-1', '散客', 'completed', NOW(), true, 60, 13.99, 'self_service', 'hermes_test', NULL, true);
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('散客单不能标为计入进度', '被约束拦住', '居然插进去了', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('散客单不能标为计入进度', '被约束拦住', SQLERRM,
       CASE WHEN SQLERRM LIKE '%timer_sessions_reward_eligible_check%' THEN 'PASS' ELSE 'FAIL' END);
  END;
END $verify$;

SELECT 编号, 检查项, 期望, 实际, 结果 FROM chk ORDER BY 编号;

ROLLBACK;
