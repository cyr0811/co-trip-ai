'use client'

import { useEffect, useState } from 'react'
import { Plane } from 'lucide-react'
import type { TripSession } from '@/lib/types'

interface LoadingPlanningStateProps {
  session: TripSession
}

export default function LoadingPlanningState({ session }: LoadingPlanningStateProps) {
  const [step, setStep] = useState(0)
  const loadingTexts = session.loadingTexts


  useEffect(() => {
    if (step >= loadingTexts.length - 1) return
    const timer = setTimeout(() => {
      setStep(prev => prev + 1)
    }, 900)
    return () => clearTimeout(timer)
  }, [loadingTexts.length, step])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* 动画图标 */}
      <div className="relative mb-10">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Plane className="w-9 h-9 text-primary animate-bounce" />
        </div>
        {/* 环形进度装饰 */}
        <div className="absolute inset-0 rounded-3xl border-2 border-primary/20 animate-ping" />
      </div>

      {/* 文字序列 */}
      <div className="text-center max-w-xs mb-8 space-y-1">
        {loadingTexts.map((text, i) => (
          <div
            key={i}
            className={`text-sm transition-all duration-500 ${
              i === step
                ? 'text-foreground font-medium opacity-100 translate-y-0'
                : i < step
                ? 'text-muted-foreground opacity-50 line-through'
                : 'text-muted-foreground/30 opacity-0'
            }`}
          >
            {i < step ? '✓ ' : i === step ? '→ ' : ''}{text}
          </div>
        ))}
      </div>

      {/* 进度条 */}
      <div className="w-48 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${((step + 1) / loadingTexts.length) * 100}%` }}
        />
      </div>

      {/* 底部提示 */}
      <p className="mt-6 text-xs text-muted-foreground">正在为你规划{session.title}…</p>
    </div>
  )
}