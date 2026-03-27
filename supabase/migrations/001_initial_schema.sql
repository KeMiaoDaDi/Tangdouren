-- ============================================================
-- 拼豆工作室 — 初始数据库 Schema
-- 时区约定: date/time 字段存储伦敦本地时间（无时区）
-- ============================================================

-- 1. Slot 模板（可预约时段配置）
CREATE TABLE slot_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date    NOT NULL,
  start_time   time    NOT NULL,
  end_time     time    NOT NULL,
  label        text,
  capacity     int     NOT NULL DEFAULT 4 CHECK (capacity > 0),
  project_type text[]  NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (date, start_time)
);

-- 2. 封禁日期
CREATE TABLE blocked_dates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL UNIQUE,
  reason     text,
  created_at timestamptz DEFAULT now()
);

-- 3. 预约记录
CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id       uuid NOT NULL REFERENCES slot_templates(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  contact       text NOT NULL,
  contact_type  text NOT NULL CHECK (contact_type IN ('wechat','phone')),
  party_size    int  NOT NULL DEFAULT 1 CHECK (party_size > 0),
  note          text,
  status        text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('pending','confirmed','cancelled','completed')),
  created_at    timestamptz DEFAULT now()
);

-- 4. 作品图库
CREATE TABLE gallery_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  alt_text     text,
  sort_order   int  DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ── 索引 ──────────────────────────────────────────────────────────────────────
CREATE INDEX idx_bookings_slot_status    ON bookings(slot_id, status);
CREATE INDEX idx_slot_templates_date     ON slot_templates(date);
CREATE INDEX idx_blocked_dates_date      ON blocked_dates(date);

-- 防止同一联系人重复预约同一 slot（已取消除外）
CREATE UNIQUE INDEX idx_unique_contact_slot
  ON bookings(slot_id, contact)
  WHERE status != 'cancelled';

-- ── 并发防护触发器 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_slot_capacity()
RETURNS TRIGGER AS $$
DECLARE
  cap    int;
  booked int;
BEGIN
  SELECT capacity INTO cap
    FROM slot_templates WHERE id = NEW.slot_id FOR UPDATE;

  SELECT COALESCE(SUM(party_size), 0) INTO booked
    FROM bookings
    WHERE slot_id = NEW.slot_id AND status != 'cancelled';

  IF booked + NEW.party_size > cap THEN
    RAISE EXCEPTION 'slot_full: 该时段已达最大人数限制';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_capacity
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_slot_capacity();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE slot_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items   ENABLE ROW LEVEL SECURITY;

-- 公开读取 slot 和 gallery（前台展示）
CREATE POLICY "Public read slots"   ON slot_templates  FOR SELECT USING (true);
CREATE POLICY "Public read gallery" ON gallery_items   FOR SELECT USING (true);

-- 匿名用户可插入预约
CREATE POLICY "Public insert bookings" ON bookings FOR INSERT WITH CHECK (true);

-- 已认证管理员拥有所有权限
CREATE POLICY "Admin all slots"    ON slot_templates  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin all blocked"  ON blocked_dates   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin all bookings" ON bookings        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin all gallery"  ON gallery_items   FOR ALL USING (auth.role() = 'authenticated');
