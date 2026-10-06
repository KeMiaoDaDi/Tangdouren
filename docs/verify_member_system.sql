-- ============================================================
-- 会员系统验收检查（PRD 24 里能在数据库层验证的部分）
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
  v_a        uuid;   -- 进度 13 的会员，测四档折扣与第二轮
  v_b        uuid;   -- 进度 2 的会员，用来测「刚解锁的奖励」与撤销守卫
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
    ('member_rewards 表存在', 'true',
     (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_rewards'))::text,
     CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_rewards') THEN 'PASS' ELSE 'FAIL' END),
    ('member_benefits 表已移除', 'false',
     (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_benefits'))::text,
     CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_benefits') THEN 'PASS' ELSE 'FAIL' END),
    ('member_visit_days 视图存在', 'true',
     (EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='member_visit_days'))::text,
     CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='member_visit_days') THEN 'PASS' ELSE 'FAIL' END),
    ('settle 函数已是 8 参数版', '8',
     (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='settle_timer_session' AND p.pronargs=8),
     CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='settle_timer_session' AND p.pronargs=8) = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- timer_sessions 的列
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
  SELECT 'member_rewards 已无 coupon_id 列', '0', count(*)::text,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='member_rewards' AND column_name='coupon_id';

  INSERT INTO chk (检查项, 期望, 实际, 结果)
  SELECT 'bookings 没有 member_id 列（本次收窄）', '0', count(*)::text,
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='bookings' AND column_name='member_id';

  ------------------------------------------------------------------
  -- 1. 造会员 A：13 个不同伦敦日期的已结算、计入进度的到店
  ------------------------------------------------------------------
  INSERT INTO members (email, email_key, display_name, consent_source)
  VALUES ('hermes.a@example.com', 'hermes.a@example.com', '甲', 'in_store')
  RETURNING member_id INTO v_a;

  INSERT INTO members (email, email_key, display_name, consent_source)
  VALUES ('hermes.b@example.com', 'hermes.b@example.com', '乙', 'booking')
  RETURNING member_id INTO v_b;

  FOR v_cnt IN 1..13 LOOP
    INSERT INTO timer_sessions (
      session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
      billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by,
      member_id, reward_eligible
    ) VALUES (
      'HT-A-' || lpad(v_cnt::text, 3, '0'), '甲', 'completed',
      ((v_today - 200 + v_cnt)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London',
      true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test',
      v_a, true
    );
  END LOOP;

  SELECT count(*) INTO v_cnt FROM member_visit_days WHERE member_id = v_a;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('13 个不同日期 = 13 次到店', '13', v_cnt::text, CASE WHEN v_cnt = 13 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM member_visit_days WHERE member_id = v_a AND reward_eligible;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('Reward Progress 也是 13', '13', v_cnt::text, CASE WHEN v_cnt = 13 THEN 'PASS' ELSE 'FAIL' END);

  -- 同一会员同一天再来一条已结算单：只算 1 次
  INSERT INTO timer_sessions (
    session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible
  ) VALUES (
    'HT-A-DUP', '甲', 'completed',
    ((v_today - 199)::timestamp + interval '18 hours') AT TIME ZONE 'Europe/London',
    true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_a, true
  );

  SELECT count(*) INTO v_cnt FROM member_visit_days WHERE member_id = v_a;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('同一天多条已结算单只算 1 次', '13', v_cnt::text, CASE WHEN v_cnt = 13 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 2. 解锁：13 次进度 → 第一轮 4 张 + 第二轮 9 折
  ------------------------------------------------------------------
  PERFORM ensure_member_rewards(v_a, NULL);

  SELECT count(*) INTO v_cnt FROM member_rewards WHERE member_id = v_a;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('13 次进度解锁 5 张（第一轮 4 + 第二轮 9 折）', '5', v_cnt::text,
     CASE WHEN v_cnt = 5 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt
    FROM (VALUES (1,'P10_OFF'),(1,'P20_OFF'),(1,'P30_OFF'),(1,'P50_OFF'),(2,'P10_OFF')) AS e(cycle_index, reward_type)
    JOIN member_rewards r ON r.member_id = v_a AND r.cycle_index = e.cycle_index AND r.reward_type = e.reward_type;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('档位与轮次都对（含第二轮 9 折）', '5', v_cnt::text, CASE WHEN v_cnt = 5 THEN 'PASS' ELSE 'FAIL' END);

  PERFORM ensure_member_rewards(v_a, NULL);
  SELECT count(*) INTO v_cnt FROM member_rewards WHERE member_id = v_a;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('重复调用不会多发（幂等）', '5', v_cnt::text, CASE WHEN v_cnt = 5 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 3. 四档折扣阶梯：结算金额逐一核对
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D1', '甲', 'completed', NOW() - interval '70 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P10_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('9 折结算（13.99 → 12.59）', '12.59', v_num::text, CASE WHEN v_num = 12.59 THEN 'PASS' ELSE 'FAIL' END);

  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D2', '甲', 'completed', NOW() - interval '65 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 280, 'member_reward', v_a, 'P20_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('8 折结算（13.99 → 11.19）', '11.19', v_num::text, CASE WHEN v_num = 11.19 THEN 'PASS' ELSE 'FAIL' END);

  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D3', '甲', 'completed', NOW() - interval '60 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 420, 'member_reward', v_a, 'P30_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('7 折结算（13.99 → 9.79）', '9.79', v_num::text, CASE WHEN v_num = 9.79 THEN 'PASS' ELSE 'FAIL' END);

  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D4', '甲', 'completed', NOW() - interval '55 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 700, 'member_reward', v_a, 'P50_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('5 折结算（13.99 → 6.99）', '6.99', v_num::text, CASE WHEN v_num = 6.99 THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_type_snapshot INTO v_txt FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('会员奖励折扣类型快照 = percentage_off', 'percentage_off', v_txt,
     CASE WHEN v_txt = 'percentage_off' THEN 'PASS' ELSE 'FAIL' END);

  SELECT discount_value_snapshot INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('5 折折扣值快照 = 50', '50.00', v_num::text, CASE WHEN v_num = 50 THEN 'PASS' ELSE 'FAIL' END);

  -- 第一轮的 9 折已经用掉，第二轮那张应当还能用
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D5', '甲', 'completed', NOW() - interval '50 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;

  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P10_OFF');
  SELECT actual_amount_gbp INTO v_num FROM timer_sessions WHERE session_id = v_s;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('第二轮 9 折还能用（13.99 → 12.59）', '12.59', v_num::text,
     CASE WHEN v_num = 12.59 THEN 'PASS' ELSE 'FAIL' END);

  -- 两张 9 折都用掉了，再要就没有了
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-A-D6', '甲', 'completed', NOW() - interval '45 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_a)
  RETURNING session_id INTO v_s;
  BEGIN
    PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_a, 'P10_OFF');
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('同类奖励用光后再用被拒', 'MEMBER_REWARD_UNAVAILABLE', '居然结算成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('同类奖励用光后再用被拒', 'MEMBER_REWARD_UNAVAILABLE', SQLERRM,
       CASE WHEN SQLERRM LIKE '%MEMBER_REWARD_UNAVAILABLE%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  ------------------------------------------------------------------
  -- 4. 折扣只能用在本人订单上（所有奖励类型都如此）
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-GUEST-1', '散客', 'completed', NOW() - interval '15 minutes', false,
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

  SELECT reward_eligible INTO v_txt FROM timer_sessions WHERE session_id = v_s2;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('散客单不产生任何人的进度（reward_eligible 为 NULL）', NULL::text, v_txt,
     CASE WHEN v_txt IS NULL THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 5. 刚解锁的奖励不能用于产生它的那笔消费（PRD 8）
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible)
  VALUES ('HT-B-001', '乙', 'completed',
          ((v_today - 30)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London',
          true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_b, true);

  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled, settled_at, settled_by,
    billing_minutes, amount_gbp, actual_amount_gbp, created_via, created_by, member_id, reward_eligible)
  VALUES ('HT-B-002', '乙', 'completed',
          ((v_today - 20)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/London',
          true, NOW(), 'hermes_test', 60, 13.99, 13.99, 'self_service', 'hermes_test', v_b, true);

  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-B-003', '乙', 'completed', NOW() - interval '5 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_b)
  RETURNING session_id INTO v_s;

  BEGIN
    PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 140, 'member_reward', v_b, 'P10_OFF');
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('刚解锁的奖励不能用于产生它的那笔消费', 'MEMBER_REWARD_UNAVAILABLE', '居然结算成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('刚解锁的奖励不能用于产生它的那笔消费', 'MEMBER_REWARD_UNAVAILABLE', SQLERRM,
       CASE WHEN SQLERRM LIKE '%MEMBER_REWARD_UNAVAILABLE%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 这笔结算本身把 9 折解锁出来，并且没有被自己用掉
  PERFORM settle_timer_session(v_s, 'hermes_test', NULL, NULL, 0, 'none', NULL, NULL);

  SELECT count(*) INTO v_cnt FROM member_rewards
   WHERE member_id = v_b AND reward_type = 'P10_OFF' AND cycle_index = 1
     AND unlocked_by_session_id = v_s AND used_at IS NULL;
  INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
    ('第 3 次到店解锁 9 折且未被本单使用', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  ------------------------------------------------------------------
  -- 6. 撤销守卫：奖励已被后续使用则不许撤销来源结算
  ------------------------------------------------------------------
  INSERT INTO timer_sessions (session_id, customer_name, status, started_at, is_settled,
    billing_minutes, amount_gbp, created_via, created_by, member_id)
  VALUES ('HT-B-004', '乙', 'completed', NOW() - interval '3 minutes', false,
          60, 13.99, 'self_service', 'hermes_test', v_b)
  RETURNING session_id INTO v_s2;

  PERFORM settle_timer_session(v_s2, 'hermes_test', NULL, NULL, 140, 'member_reward', v_b, 'P10_OFF');

  BEGIN
    PERFORM unsettle_timer_session(v_s);
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('奖励已被后续使用则不许撤销来源结算', 'REWARD_ALREADY_USED', '居然撤销成功', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('奖励已被后续使用则不许撤销来源结算', 'REWARD_ALREADY_USED', SQLERRM,
       CASE WHEN SQLERRM LIKE '%REWARD_ALREADY_USED%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  ------------------------------------------------------------------
  -- 7. 约束守卫生效
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO member_rewards (member_id, reward_type, cycle_index)
    VALUES (v_b, 'TWO_POUND', 90);
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('旧奖励类型被约束拦住', '被约束拦住', '居然插进去了', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('旧奖励类型被约束拦住', '被约束拦住', SQLERRM,
       CASE WHEN SQLERRM LIKE '%member_rewards_type_check%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  BEGIN
    INSERT INTO member_rewards (member_id, reward_type, cycle_index)
    VALUES (v_b, 'P10_OFF', 0);
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('轮次必须从 1 开始', '被约束拦住', '居然插进去了', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO chk (检查项, 期望, 实际, 结果) VALUES
      ('轮次必须从 1 开始', '被约束拦住', SQLERRM,
       CASE WHEN SQLERRM LIKE '%member_rewards_cycle_check%' THEN 'PASS' ELSE 'FAIL' END);
  END;

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
