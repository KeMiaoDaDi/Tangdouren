import { createAdminClient } from '@/lib/supabase/admin'
import HomeContent from './_components/HomeContent'

export const revalidate = 60

export default async function HomePage() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('gallery_items')
    .select('id, storage_path, alt_text, category')
    .eq('category', '展示图库')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(4)

  return <HomeContent featuredWorks={data ?? []} />
}
