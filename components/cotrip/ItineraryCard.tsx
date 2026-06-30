'use client'

import { useState } from 'react'
import { MapPin, Edit3, Lock, Unlock, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { DayPlan, dayColors, DayIntensity } from '@/lib/mock-data'
import { buildExternalSearchLinks } from '@/lib/external-search'
import { cn } from '@/lib/utils'

interface ItineraryCardProps {
  plan: DayPlan
  isActive: boolean
  isUpdated?: boolean
  onClick: () => void
}

const intensityConfig: Record<DayIntensity, { color: string; dots: number }> = {
  轻松: { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', dots: 1 },
  适中: { color: 'text-amber-600 bg-amber-50 border-amber-200', dots: 2 },
  较满: { color: 'text-rose-600 bg-rose-50 border-rose-200', dots: 3 },
}

const periodColors: Record<string, string> = {
  上午: 'bg-sky-50 text-sky-700 border-sky-200',
  下午: 'bg-amber-50 text-amber-700 border-amber-200',
  晚上: 'bg-violet-50 text-violet-700 border-violet-200',
  全天: 'bg-rose-50 text-rose-700 border-rose-200',
}

function mapPlaceType(type: DayPlan['places'][number]['type']) {
  if (type === 'food') return 'restaurant'
  if (type === 'hotel') return 'hotel'
  if (type === 'transport') return 'transport'
  return 'spot'
}

export default function ItineraryCard({
  plan,
  isActive,
  isUpdated,
  onClick,
}: ItineraryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [locked, setLocked] = useState(plan.locked ?? false)
  const colors = dayColors[plan.day]
  const intensity = intensityConfig[plan.intensity]

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer group',
        isActive
          ? 'border-primary/50 shadow-md ring-2 ring-primary/20 bg-card'
          : 'border-border/60 bg-card hover:border-primary/30 hover:shadow-sm',
        locked && 'opacity-80'
      )}
      onClick={onClick}
    >
      {/* 卡片头部 */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Day 编号 */}
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-heading font-bold text-lg', colors.bg, colors.text)}>
            {plan.day}
          </div>

          {/* 标题和主题 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-bold text-sm text-foreground truncate">
                Day {plan.day} · {plan.title}
              </h3>
              {isUpdated && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  已更新
                </span>
              )}
              {locked && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium shrink-0">
                  已锁定
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{plan.theme}</p>
          </div>

          {/* 强度徽章 */}
          <span className={cn('text-xs rounded-full px-2.5 py-0.5 border font-medium shrink-0', intensity.color)}>
            {plan.intensity}
          </span>
        </div>

        {/* 行程槽位预览 */}
        <div className="mt-3 space-y-1.5">
          {plan.slots.map((slot, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn('text-xs rounded-md px-1.5 py-0.5 border shrink-0 font-medium', periodColors[slot.period])}>
                {slot.period}
              </span>
              <span className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
                {slot.activities.join(' · ')}
              </span>
            </div>
          ))}
        </div>

        {/* 展开/收起详情 */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/40">
            {/* 推荐理由 */}
            <div className="bg-primary/5 rounded-xl p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">规划理由</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{plan.reason}</p>
            </div>

            {/* 地点列表 */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {plan.places.map((place, i) => {
                const links = buildExternalSearchLinks({
                  name: place.name,
                  type: mapPlaceType(place.type),
                })
                return (
                  <span key={place.id} className="flex items-center gap-1 text-xs bg-background border border-border/50 rounded-full px-2.5 py-1">
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: colors.dot }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{place.name}</span>
                    <a
                      href={links.xhsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={event => event.stopPropagation()}
                    >
                      小红书
                    </a>
                    <a
                      href={links.dianpingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:text-amber-700"
                      onClick={event => event.stopPropagation()}
                    >
                      点评
                    </a>
                  </span>
                )
              })}
            </div>

            {/* 交通时间 */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span>当日预计交通时间：{plan.estimatedTransport}</span>
            </div>
          </div>
        )}
      </div>

      {/* 操作栏 */}
      <div
        className="flex items-center gap-1 px-4 py-2.5 bg-background/50 border-t border-border/30"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClick}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
        >
          <MapPin className="w-3 h-3" />
          查看地图
        </button>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
        >
          <Edit3 className="w-3 h-3" />
          修改
        </button>
        <button
          onClick={() => setLocked(v => !v)}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-lg',
            locked
              ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
              : 'text-muted-foreground hover:text-foreground hover:bg-background'
          )}
        >
          {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          {locked ? '已锁定' : '锁定'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-background"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? '收起' : '详情'}
        </button>
      </div>
    </div>
  )
}
