-- started_at 改为可空，支持 idle（已创建未开始）状态
ALTER TABLE timer_sessions ALTER COLUMN started_at DROP NOT NULL;

-- 扩展 status 枚举，加入 idle
ALTER TABLE timer_sessions DROP CONSTRAINT IF EXISTS timer_sessions_status_check;
ALTER TABLE timer_sessions ADD CONSTRAINT timer_sessions_status_check
  CHECK (status IN ('idle', 'running', 'paused', 'completed'));
