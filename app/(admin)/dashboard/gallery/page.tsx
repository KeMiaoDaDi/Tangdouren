'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Upload, Trash2, GripVertical } from 'lucide-react'

const mockGallery = [
  { id: 'g1', path: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', alt: '彩虹独角兽', order: 0 },
  { id: 'g2', path: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=400&h=400&fit=crop', alt: '星空银河', order: 1 },
  { id: 'g3', path: 'https://images.unsplash.com/photo-1611003229636-9f9128dbb445?w=400&h=400&fit=crop', alt: '柴犬肖像', order: 2 },
  { id: 'g4', path: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop', alt: '草莓蛋糕', order: 3 },
  { id: 'g5', path: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&h=400&fit=crop', alt: '日式庭院', order: 4 },
  { id: 'g6', path: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=400&h=400&fit=crop', alt: '海底世界', order: 5 },
]

export default function GalleryAdminPage() {
  const [items, setItems] = useState(mockGallery)

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">作品图库</h1>
        <p className="text-sm text-charcoal-light mt-0.5">管理前台展示的作品图片</p>
      </div>

      {/* Upload zone */}
      <div className="card border-2 border-dashed border-sand-200 p-8 text-center hover:border-terracotta/40 transition-colors cursor-pointer">
        <Upload size={32} className="mx-auto mb-3 text-sand-300" />
        <p className="text-sm font-medium text-charcoal">点击或拖拽上传图片</p>
        <p className="text-xs text-charcoal-light mt-1">支持 JPG、PNG、WebP，建议正方形，最大 5MB</p>
        <button className="btn-primary mt-4 text-sm px-5 py-2">
          <Upload size={14} />
          选择图片
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.id} className="group relative card overflow-hidden aspect-square">
            <Image src={item.path} alt={item.alt} fill className="object-cover" sizes="200px" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />

            {/* Controls */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button className="p-2 rounded-xl bg-white/90 text-charcoal hover:bg-white shadow-sm">
                <GripVertical size={14} />
              </button>
              <button
                onClick={() => removeItem(item.id)}
                className="p-2 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-sm"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Alt text */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
              <p className="text-white text-xs truncate">{item.alt}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-charcoal-light text-center">共 {items.length} 张图片 · 拖拽可调整排序（需连接 Supabase Storage）</p>
    </div>
  )
}
