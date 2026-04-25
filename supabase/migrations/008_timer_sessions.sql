-- 拼豆计时订单表
CREATE TABLE IF NOT EXISTS timer_sessions (
  session_id        TEXT PRIMARY KEY,                -- PB-YYYYMMDD-NNN
  booking_id        UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,
  customer_name     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'paused', 'completed')),
  started_at        TIMESTAMPTZ NOT NULL,
  paused_at         TIMESTAMPTZ,                     -- 当前暂停开始时刻（running 时为 null）
  total_paused_ms   BIGINT NOT NULL DEFAULT 0,       -- 累计暂停毫秒数
  stopped_at        TIMESTAMPTZ,                     -- 结束时刻
  elapsed_minutes   INTEGER,                         -- 实际用时（分钟，完成后填写）
  billing_minutes   INTEGER,                         -- 计费时长（分钟，完成后填写）
  amount_gbp        NUMERIC(8,2),                    -- 总金额（英镑）
  amount_cny        NUMERIC(10,2),                   -- 总金额（人民币，可选）
  exchange_rate     NUMERIC(10,4),                   -- 使用的汇率（GBP→CNY）
  bill_breakdown    JSONB,                           -- 计费明细 [{ label, amount }]
  created_by        TEXT,                            -- 创建人（管理员邮箱）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按状态查询加速
CREATE INDEX IF NOT EXISTS idx_timer_sessions_status    ON timer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_timer_sessions_booking   ON timer_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_timer_sessions_created   ON timer_sessions(created_at DESC);
