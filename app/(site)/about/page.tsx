import Link from 'next/link'
import Image from 'next/image'
import { Heart, Sparkles, Leaf, ArrowRight } from 'lucide-react'

const values = [
  { icon: Heart,    title: '用心陪伴',  desc: '每一场体验，老师全程在旁指导，确保你能顺利完成心仪的作品，满载而归。' },
  { icon: Sparkles, title: '创意无限',  desc: '从经典图案到完全定制，我们帮你把任何想象变成拼豆现实。' },
  { icon: Leaf,     title: '温馨环境',  desc: '工作室空间精心布置，让你在创作时感受到家一般的舒适与温暖。' },
]

export default function AboutPage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="py-20 bg-gradient-to-br from-cream to-warm-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-terracotta text-sm font-medium tracking-wider uppercase">关于我们</span>
              <h1 className="font-display text-4xl font-bold text-charcoal mt-2 mb-6 leading-tight sm:text-5xl">
                在伦敦，<br />
                用豆子<span className="text-terracotta">讲故事</span>
              </h1>
              <p className="text-charcoal-light leading-relaxed mb-4">
                糖豆人手工工作室是一家坐落于伦敦东区 Whitechapel 的手作体验工作室，专注于拼豆（Hama Beads / Perler Beads）这门充满趣味的手工艺。
              </p>
              <p className="text-charcoal-light leading-relaxed mb-6">
                我们相信，每个人心里都有一个想要亲手创造美好事物的念头。
                无论你是完全的零基础，还是想挑战高难度定制，这里都有属于你的位置。
              </p>
              <Link href="/booking" className="btn-primary">
                预约体验课
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="relative h-80 lg:h-[500px] rounded-3xl overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop"
                alt="工作室环境"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-terracotta/20 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-terracotta text-sm font-medium tracking-wider uppercase">我们的故事</span>
          <h2 className="section-title mt-2 mb-6">从一颗豆子开始</h2>
          <div className="space-y-4 text-charcoal-light leading-relaxed text-left">
            <p>
              工作室创始人小豆从小就对手工艺充满热情，大学毕业后来到伦敦留学，在一次跳蚤市场上第一次看到了精美的拼豆作品，从此一发不可收拾。
            </p>
            <p>
              经过多年的钻研与积累，小豆在伦敦开设了这间工作室，希望把这份来自东亚的手工乐趣带给更多的人——无论是在英华人、留学生，还是对中国文化感兴趣的英国朋友。
            </p>
            <p>
              到目前为止，工作室已经接待了超过 500 位学员，完成了无数件独一无二的作品。每一件作品背后，都有一段温暖的故事。
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-warm-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">我们的理念</span>
            <h2 className="section-title mt-2">为什么选择我们</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-6 text-center">
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

      {/* FAQ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">常见问题</span>
            <h2 className="section-title mt-2">你可能想知道</h2>
          </div>

          <div className="space-y-4">
            {[
              { q: '需要提前准备什么吗？', a: '什么都不需要！所有材料（珠板、拼豆、熨斗等）工作室都会提供，你只需要带上好心情来就好。' },
              { q: '适合小朋友参加吗？', a: '建议 6 岁以上的小朋友参加，需要家长全程陪同。10 岁以上可以独立完成大部分作品。' },
              { q: '多人组团来可以一起预约吗？', a: '当然可以！每个时段最多接受 4 人同时体验，预约时填写人数，我们会为同组安排相邻位置。' },
              { q: '作品当天可以带走吗？', a: '大部分作品当场完成后即可带走。图案较复杂时可能需要额外熨烫时间，我们会提前告知。' },
              { q: '预约后可以取消或改期吗？', a: '可以！请至少提前 48 小时联系我们修改或取消预约，超时取消可能无法退还定金（如有）。' },
            ].map(({ q, a }) => (
              <details key={q} className="card group">
                <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-medium text-charcoal list-none">
                  {q}
                  <span className="text-terracotta transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-charcoal-light leading-relaxed border-t border-sand-100 pt-4">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
