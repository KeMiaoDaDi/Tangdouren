-- ============================================================
-- Migration 005: 定金预约系统 — 扩展 bookings 表
-- 新增：定金字段、支付字段、取消 token 字段、退款字段
-- 扩展：status CHECK 约束以支持支付状态机
-- 回滚方案：见文末 ROLLBACK 注释
-- ============================================================

-- 1. 扩展 status CHECK 约束
--    先删除旧约束，再添加新约束（Postgres 不支持 ALTER CHECK 直接修改）
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'payment_pending',    -- 已锁位，等待支付（有超时）
    'payment_failed',     -- 支付失败，占位释放
    'expired',            -- 支付超时，占位自动释放
    'confirmed',          -- 支付成功，预约确认
    'completed',          -- 体验完成
    'cancelled',          -- 已取消
    'refund_pending',     -- 退款已发起，等待处理
    'refunded',           -- 全额退款完成
    'partially_refunded'  -- 部分退款完成（预留）
  ));

-- 2. 新增定金与支付字段
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_amount       int,          -- 单位：便士（£5 = 500）
  ADD COLUMN IF NOT EXISTS currency             text DEFAULT 'gbp',
  ADD COLUMN IF NOT EXISTS payment_provider     text DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS checkout_session_id  text UNIQUE,  -- Stripe Checkout Session ID
  ADD COLUMN IF NOT EXISTS payment_intent_id    text UNIQUE;  -- Stripe PaymentIntent ID

-- 3. 新增取消 token 字段
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancel_token_hash       text,       -- SHA-256(token)，不存明文
  ADD COLUMN IF NOT EXISTS cancel_token_expires_at timestamptz;

-- 4. 新增取消与退款字段
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason  text,               -- 'customer' | 'admin'
  ADD COLUMN IF NOT EXISTS refund_amount  int,                -- 单位：便士
  ADD COLUMN IF NOT EXISTS refund_id      text,               -- Stripe Refund ID
  ADD COLUMN IF NOT EXISTS refunded_at    timestamptz;

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_bookings_checkout_session
  ON bookings(checkout_session_id) WHERE checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_cancel_token
  ON bookings(cancel_token_hash) WHERE cancel_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON bookings(status, created_at);

-- ============================================================
-- ROLLBACK（如需撤销）：
--
-- ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
-- ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
--   CHECK (status IN ('pending','confirmed','completed','cancelled'));
-- ALTER TABLE bookings
--   DROP COLUMN IF EXISTS deposit_amount,
--   DROP COLUMN IF EXISTS currency,
--   DROP COLUMN IF EXISTS payment_provider,
--   DROP COLUMN IF EXISTS checkout_session_id,
--   DROP COLUMN IF EXISTS payment_intent_id,
--   DROP COLUMN IF EXISTS cancel_token_hash,
--   DROP COLUMN IF EXISTS cancel_token_expires_at,
--   DROP COLUMN IF EXISTS cancelled_at,
--   DROP COLUMN IF EXISTS cancel_reason,
--   DROP COLUMN IF EXISTS refund_amount,
--   DROP COLUMN IF EXISTS refund_id,
--   DROP COLUMN IF EXISTS refunded_at;
-- ============================================================
