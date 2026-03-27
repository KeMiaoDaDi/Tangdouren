import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '拼豆工作室 · Pinbean Studio London',
  description: '伦敦手作拼豆工作室，提供趣味拼豆体验课程，定制专属作品。预约您的专属时光。',
  keywords: ['拼豆', '手作', '伦敦', '工作室', '体验课', 'Hama Beads', 'London'],
  openGraph: {
    title: '拼豆工作室 · Pinbean Studio London',
    description: '伦敦手作拼豆工作室，提供趣味拼豆体验课程',
    locale: 'zh_CN',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
