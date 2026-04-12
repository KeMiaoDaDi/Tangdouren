-- ============================================================
-- 拼豆工作室 — 图库分类字段
-- 为 gallery_items 添加 category 字段
-- ============================================================

ALTER TABLE gallery_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '其他';

-- 同时确保 Storage bucket 提示：
-- 请在 Supabase 控制台手动创建名为 "gallery" 的 Storage Bucket，并设置为 Public。
-- Supabase Dashboard → Storage → New Bucket → Name: gallery → Public: true
