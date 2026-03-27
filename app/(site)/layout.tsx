import NavBar from '@/components/site/NavBar'
import Footer from '@/components/site/Footer'
import MobileBookingBar from '@/components/site/MobileBookingBar'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <MobileBookingBar />
    </>
  )
}
