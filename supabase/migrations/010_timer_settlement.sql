-- 为 timer_sessions 添加结算字段
ALTER TABLE timer_sessions
  ADD COLUMN IF NOT EXISTS actual_amount_gbp  NUMERIC(8,2),      -- 实收金额（英镑）
  ADD COLUMN IF NOT EXISTS actual_amount_cny  NUMERIC(10,2),     -- 实收金额（人民币，可选）
  ADD COLUMN IF NOT EXISTS settlement_note    TEXT,              -- 结算备注
  ADD COLUMN IF NOT EXISTS settled_at         TIMESTAMPTZ,       -- 结算时间
  ADD COLUMN IF NOT EXISTS settled_by         TEXT,              -- 结算操作员
  ADD COLUMN IF NOT EXISTS is_settled         BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_timer_sessions_settled ON timer_sessions(is_settled);
