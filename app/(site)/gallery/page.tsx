import { createAdminClient } from '@/lib/supabase/admin'
import GalleryGrid from '@/components/site/GalleryGrid'
import type { GalleryItem } from '@/components/site/GalleryGrid'

export const revalidate = 60 // 每 60 秒重新验证

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
      {/* Header */}
      <section className="py-16 bg-gradient-to-br from-cream to-warm-100 text-center">
        <span className="text-terracotta text-sm font-medium tracking-wider uppercase">作品展示</span>
        <h1 className="font-display text-4xl font-bold text-charcoal mt-2 sm:text-5xl">
          每件作品都是<span className="text-terracotta">独一无二</span>的
        </h1>
        <p className="mt-4 text-charcoal-light max-w-md mx-auto">
          银河战舰的最后一块拼图，就差你了！
        </p>
      </section>

      {items.length === 0 ? (
        <>
          <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-sand-100 py-3">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2">
                <button className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium bg-terracotta text-white">
                  全部
                </button>
              </div>
            </div>
          </section>
          <section className="py-20 bg-warm-50">
            <div className="text-center text-charcoal-light">
              <div className="text-6xl mb-4">🫘</div>
              <p className="text-base font-medium text-charcoal">作品图库正在整理中</p>
              <p className="text-sm mt-2">敬请期待，更多精彩作品即将上线</p>
            </div>
          </section>
        </>
      ) : (
        <GalleryGrid items={items} />
      )}
    </div>
  )
}
