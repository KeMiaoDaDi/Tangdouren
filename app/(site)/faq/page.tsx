import Link from 'next/link'
import { ArrowRight, Heart, Sparkles, Leaf } from 'lucide-react'

const values = [
  { icon: Heart,    title: '用心陪伴',  desc: '每一场体验，店员全程在旁指导，确保你能顺利完成心仪的作品，满载而归。' },
  { icon: Sparkles, title: '创意无限',  desc: '从经典图案到完全定制，我们帮你把任何想象变成拼豆现实。' },
  { icon: Leaf,     title: '温馨环境',  desc: '工作室空间精心布置，让你在创作时感受到家一般的舒适与温暖。' },
]

const faqs = [
  {
    q: '需要提前准备什么吗？',
    a: '什么都不需要！所有材料（珠板、拼豆、熨斗等）工作室都会提供，你只需要带上好心情来就好。',
  },
  {
    q: '适合小朋友参加吗？',
    a: '建议 6 岁以上的小朋友参加，需要家长全程陪同。10 岁以上可以独立完成大部分作品。',
  },
  {
    q: '多人组团来可以一起预约吗？',
    a: '当然可以！每个时段最多接受 4 人同时体验，预约时填写人数，我们会为同组安排相邻位置。',
  },
  {
    q: '作品当天可以带走吗？',
    a: '大部分作品当场完成后即可带走。图案较复杂时可能需要额外熨烫时间，我们会提前告知。',
  },
  {
    q: '预约后可以取消或改期吗？',
    a: '可以！请至少提前 12 小时联系我们修改或取消预约，超时取消可能无法退还定金（如有）。',
  },
  {
    q: '零基础也能完成作品吗？',
    a: '完全没问题！拼豆不需要任何美术基础，我们提供丰富的图案模板供选择，店员全程在旁协助。',
  },
  {
    q: '可以带自己设计的图案来吗？',
    a: '当然欢迎！你可以提前将图案发给我们确认可行性，或当天带来，我们帮你转换成拼豆图纸。',
  },
  {
    q: '工作室在哪里，怎么去？',
    a: 'Unit 226, 65-75 Whitechapel Road, London E1 1DU。步行即可到达 Aldgate East 地铁站，交通非常方便。',
  },
]

export default function FaqPage() {
  return (
    <div className="pt-16">
      {/* Why Us */}
      <section className="py-20 bg-warm-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">我们的理念</span>
            <h2 className="section-title mt-2">为什么选择我们</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta/10">
                  <Icon size={24} className="text-terracotta" />
                </div>
                <h3 className="font-display text-lg font-semibold text-charcoal mb-2">{title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Header */}
      <section className="py-20 bg-gradient-to-br from-cream to-warm-100">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-terracotta text-sm font-medium tracking-wider uppercase">FAQs</span>
          <h1 className="font-display text-4xl font-bold text-charcoal mt-3 mb-4 sm:text-5xl">
            常见问题
          </h1>
          <p className="text-charcoal-light leading-relaxed">
            有什么不确定的？这里可能已经有你想要的答案。
          </p>
        </div>
      </section>

      {/* FAQ List */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <details key={q} className="card group">
                <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-medium text-charcoal list-none">
                  {q}
                  <span className="ml-4 shrink-0 text-terracotta transition-transform duration-200 group-open:rotate-45">＋</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-charcoal-light leading-relaxed border-t border-sand-100 pt-4">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-warm-50">
        <div className="mx-auto max-w-xl px-4 text-center">
          <p className="text-charcoal-light mb-6">还有其他问题？欢迎直接预约，我们到时候当面聊！</p>
          <Link href="/booking" className="btn-primary text-base px-8 py-3.5">
            立即预约体验
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  )
}
