import Image from 'next/image'

const categories = ['全部', '动物系列', '风景系列', '美食系列', '宠物定制', '卡通人物']

const galleryItems = [
  { id: 1,  title: '彩虹独角兽',   category: '动物系列',  src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop' },
  { id: 2,  title: '星空银河',     category: '风景系列',  src: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=600&h=600&fit=crop' },
  { id: 3,  title: '柴犬肖像',     category: '宠物定制',  src: 'https://images.unsplash.com/photo-1611003229636-9f9128dbb445?w=600&h=600&fit=crop' },
  { id: 4,  title: '草莓蛋糕',     category: '美食系列',  src: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&h=600&fit=crop' },
  { id: 5,  title: '日式庭院',     category: '风景系列',  src: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600&h=600&fit=crop' },
  { id: 6,  title: '海底世界',     category: '动物系列',  src: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600&h=600&fit=crop' },
  { id: 7,  title: '樱花树',       category: '风景系列',  src: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=600&h=600&fit=crop' },
  { id: 8,  title: '猫咪午后',     category: '宠物定制',  src: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=600&fit=crop' },
  { id: 9,  title: '抹茶拿铁',     category: '美食系列',  src: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=600&fit=crop' },
  { id: 10, title: '向日葵田',     category: '风景系列',  src: 'https://images.unsplash.com/photo-1500485569351-41cf17ba9e6d?w=600&h=600&fit=crop' },
  { id: 11, title: '小熊维尼',     category: '卡通人物',  src: 'https://images.unsplash.com/photo-1559591935-c9a80e48b4be?w=600&h=600&fit=crop' },
  { id: 12, title: '宫崎骏风',     category: '卡通人物',  src: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&h=600&fit=crop' },
]

export default function GalleryPage() {
  return (
    <div className="pt-16">
      {/* Header */}
      <section className="py-16 bg-gradient-to-br from-cream to-warm-100 text-center">
        <span className="text-terracotta text-sm font-medium tracking-wider uppercase">作品展示</span>
        <h1 className="font-display text-4xl font-bold text-charcoal mt-2 sm:text-5xl">
          每件作品都是<span className="text-terracotta">独一无二</span>的
        </h1>
        <p className="mt-4 text-charcoal-light max-w-md mx-auto">
          这里收录了学员们在工作室创作的部分作品，希望给你带来灵感
        </p>
      </section>

      {/* Category filter (static UI) */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-sand-100 py-3">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat, i) => (
              <button
                key={cat}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  i === 0
                    ? 'bg-terracotta text-white'
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
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {galleryItems.map((item) => (
              <div
                key={item.id}
                className="break-inside-avoid card-hover group cursor-pointer"
              >
                <div className="relative overflow-hidden rounded-2xl aspect-square">
                  <Image
                    src={item.src}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-0 left-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-white text-sm font-semibold">{item.title}</p>
                    <span className="inline-block mt-1 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-xs text-white/80">
                      {item.category}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
