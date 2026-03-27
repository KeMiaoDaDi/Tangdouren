import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client — 仅在 API Routes / Server Actions 中使用
// 绕过所有 RLS 策略
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
