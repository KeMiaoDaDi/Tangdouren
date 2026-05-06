import NavBar from '@/components/site/NavBar'
import Footer from '@/components/site/Footer'
import MobileBookingBar from '@/components/site/MobileBookingBar'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <NavBar />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <MobileBookingBar />
    </LanguageProvider>
  )
}
