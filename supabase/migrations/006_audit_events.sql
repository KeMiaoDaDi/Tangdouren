-- ============================================================
-- Migration 006: 预约事件审计日志表
-- 记录所有关键操作，可查可审计，不含敏感信息
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  metadata    jsonb,                    -- 不含 token 明文、密钥、完整卡信息
  created_at  timestamptz DEFAULT now()
);

-- event_type 枚举说明（仅文档，不做 DB 约束以便扩展）：
-- booking_created        — 预约记录创建
-- checkout_created       — Stripe Checkout Session 已创建
-- payment_confirmed      — 支付成功（webhook 确认）
-- payment_failed         — 支付失败
-- booking_expired        — 超时未支付，占位释放
-- confirmation_email_sent — 确认邮件已发送
-- email_failed           — 邮件发送失败
-- cancellation_requested — 用户提交取消请求
-- refund_initiated       — 退款已发起
-- refund_succeeded       — 退款成功
-- refund_failed          — 退款失败
-- cancellation_email_sent — 取消确认邮件已发送
-- admin_action           — 后台管理员操作

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id
  ON booking_events(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_events_type
  ON booking_events(event_type, created_at DESC);

-- RLS：管理员可读写，公开不可见
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all booking_events"
  ON booking_events FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- ROLLBACK：
-- DROP TABLE IF EXISTS booking_events;
-- ============================================================
