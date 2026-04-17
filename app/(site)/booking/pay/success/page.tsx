import { Suspense } from 'react'
import SuccessPageContent from './SuccessPageContent'

export default function PaySuccessPage() {
  return (
    <Suspense fallback={
      <div className="pt-16 min-h-screen flex items-center justify-center">
        <div className="text-charcoal-light text-sm">加载中…</div>
      </div>
    }>
      <SuccessPageContent />
    </Suspense>
  )
}
