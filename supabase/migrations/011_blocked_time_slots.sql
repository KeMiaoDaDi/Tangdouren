-- 封禁特定日期某时段（不影响整天封禁）
CREATE TABLE IF NOT EXISTS blocked_time_slots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE        NOT NULL,
  start_time TEXT        NOT NULL,  -- 'HH:MM'
  end_time   TEXT        NOT NULL,  -- 'HH:MM'
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_time_slots_date ON blocked_time_slots(date);
