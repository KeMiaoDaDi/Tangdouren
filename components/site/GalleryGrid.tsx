'use client'

import { useState } from 'react'
import Image from 'next/image'

export const GALLERY_CATEGORIES = ['全部', '展示图库', '动物系列', '风景系列', '美食系列', '宠物定制', '卡通人物', '其他']

export interface GalleryItem {
  id: string
  storage_path: string
  alt_text:     string | null
  category:     string
  sort_order:   number
}

interface GalleryGridProps {
  items: GalleryItem[]
}

export default function GalleryGrid({ items }: GalleryGridProps) {
  const [activeCategory, setActive] = useState('全部')

  const filtered = activeCategory === '全部'
    ? items
    : items.filter(i => i.category === activeCategory)

  // 只显示实际有图片的分类（+ 全部）
  const usedCategories = ['全部', ...Array.from(new Set(items.map(i => i.category)))]

  return (
    <>
      {/* Category filter */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-sand-100 py-3">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {GALLERY_CATEGORIES.filter(c => usedCategories.includes(c)).map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-terracotta text-white shadow-warm'
                    : 'bg-warm-100 text-charcoal-light hover:bg-sand-200 hover:text-charcoal'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="py-12 bg-warm-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-charcoal-light">
              <div className="text-5xl mb-4">🫘</div>
              <p className="text-sm">该分类暂无作品，敬请期待</p>
            </div>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="break-inside-avoid card-hover group cursor-pointer"
                >
                  <div className="relative overflow-hidden rounded-2xl aspect-square">
                    <Image
                      src={item.storage_path}
                      alt={item.alt_text ?? item.category}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-0 left-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                      {item.alt_text && (
                        <p className="text-white text-sm font-semibold">{item.alt_text}</p>
                      )}
                      <span className="inline-block mt-1 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-xs text-white/80">
                        {item.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
