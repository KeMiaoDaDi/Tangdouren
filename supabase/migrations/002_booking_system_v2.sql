-- ============================================================
-- 拼豆工作室 — 预约系统 V2
-- 新增桌位表，重建预约记录表（按桌位动态排班）
-- 保留: slot_templates, blocked_dates, gallery_items
-- ============================================================

-- 1. 物理桌位表
CREATE TABLE IF NOT EXISTS tables (
  table_id   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  table_code text    NOT NULL UNIQUE,
  table_type text    NOT NULL CHECK (table_type IN ('single', 'double', 'four')),
  capacity   int     NOT NULL CHECK (capacity > 0),
  is_active  boolean NOT NULL DEFAULT true
);

INSERT INTO tables (table_code, table_type, capacity) VALUES
  ('S1','single',1),('S2','single',1),('S3','single',1),
  ('S4','single',1),('S5','single',1),('S6','single',1),
  ('D1','double',2),('D2','double',2),('D3','double',2),('D4','double',2),
  ('F1','four',  4),('F2','four',  4)
ON CONFLICT (table_code) DO NOTHING;

-- 2. 废弃旧 bookings，建新表（注意：此操作清除旧预约数据）
DROP TABLE IF EXISTS bookings CASCADE;

CREATE TABLE bookings (
  booking_id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_date               date    NOT NULL,
  customer_name              text    NOT NULL,
  phone                      text    NOT NULL,
  party_size                 int     NOT NULL CHECK (party_size BETWEEN 1 AND 4),
  accepts_sharing            boolean NOT NULL DEFAULT false,
  start_time                 time    NOT NULL,
  end_time                   time    NOT NULL,
  buffered_end_time          time    NOT NULL,
  estimated_duration_minutes int     NOT NULL CHECK (estimated_duration_minutes > 0),
  assigned_table_id          uuid    REFERENCES tables(table_id) ON DELETE RESTRICT,
  assigned_table_code        text    NOT NULL,
  assigned_table_type        text    NOT NULL CHECK (assigned_table_type IN ('single','double','four')),
  booking_mode               text    NOT NULL CHECK (booking_mode IN ('private_full_table','shared_partial_table')),
  seat_group_type            text    NOT NULL CHECK (seat_group_type IN (
                               'single_on_single','single_on_double_shared',
                               'double_on_double','double_on_four_shared','group_on_four')),
  status                     text    NOT NULL DEFAULT 'confirmed'
                               CHECK (status IN ('pending','confirmed','completed','cancelled')),
  remark                     text,
  created_at                 timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX idx_bookings_v2_date        ON bookings(booking_date);
CREATE INDEX idx_bookings_v2_table_date  ON bookings(assigned_table_id, booking_date);
CREATE INDEX idx_bookings_v2_status      ON bookings(status);
CREATE INDEX idx_bookings_v2_phone_date  ON bookings(phone, booking_date);

-- RLS
ALTER TABLE tables   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tables"      ON tables   FOR SELECT USING (true);
CREATE POLICY "Admin all tables"        ON tables   FOR ALL    USING (auth.role() = 'authenticated');
CREATE POLICY "Public insert bookings"  ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin all bookings"      ON bookings FOR ALL    USING (auth.role() = 'authenticated');
