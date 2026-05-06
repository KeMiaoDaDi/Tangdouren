import { createAdminClient } from '@/lib/supabase/admin'
import GalleryGrid from '@/components/site/GalleryGrid'
import GalleryHeader from './_components/GalleryHeader'
import type { GalleryItem } from '@/components/site/GalleryGrid'

export const revalidate = 60

export default async function GalleryPage() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('gallery_items')
    .select('id, storage_path, alt_text, category, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at',  { ascending: false })

  const items: GalleryItem[] = data ?? []

  return (
    <div className="pt-16">
      <GalleryHeader />

      {items.length === 0 ? (
        <>
          <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-sand-100 py-3">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2">
                <button className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium bg-terracotta text-white">
                  All
                </button>
              </div>
            </div>
          </section>
          <section className="py-20 bg-warm-50">
            <div className="text-center text-charcoal-light">
              <div className="text-6xl mb-4">🫘</div>
              <p className="text-base font-medium text-charcoal">Gallery coming soon</p>
              <p className="text-sm mt-2">More amazing works on their way</p>
            </div>
          </section>
        </>
      ) : (
        <GalleryGrid items={items} />
      )}
    </div>
  )
}
