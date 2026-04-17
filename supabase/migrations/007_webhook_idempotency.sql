-- ============================================================
-- Migration 007: Stripe Webhook 幂等去重表
-- 防止同一事件被重复处理（Stripe 可能重复投递）
-- ============================================================

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  stripe_event_id  text        PRIMARY KEY,   -- Stripe 事件 ID，如 evt_xxx
  processed_at     timestamptz DEFAULT now()
);

-- 自动清理 30 天前的记录（可选，避免表无限增长）
-- 如需启用，在 Supabase Dashboard → Database → Extensions 开启 pg_cron
-- SELECT cron.schedule('cleanup-webhook-events', '0 3 * * *',
--   $$DELETE FROM processed_webhook_events WHERE processed_at < now() - interval '30 days'$$);

-- RLS：仅服务端（Service Role）访问，禁止公开读写
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only webhook events"
  ON processed_webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- ROLLBACK：
-- DROP TABLE IF EXISTS processed_webhook_events;
-- ============================================================
