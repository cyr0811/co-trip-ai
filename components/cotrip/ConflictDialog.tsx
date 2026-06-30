'use client'

import { useState } from 'react'
import { AlertTriangle, Clock, MapPin, Heart, Check, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConflictDialogProps {
  onClose: () => void
}

const conflictTypes = [
  {
    icon: Clock,
    label: '时间冲突',
    desc: '迪士尼通常需要 8-10 小时，压缩了其他景点的游玩时间',
    color: 'text-rose-600 bg-rose-50 border-rose-200',
  },
  {
    icon: MapPin,
    label: '空间冲突',
    desc: '浅草、涩谷、六本木和迪士尼分布在 4 个不同区域，交通耗时约 3 小时',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  {
    icon: Heart,
    label: '偏好冲突',
    desc: '你希望旅行节奏轻松，但这个安排强度远高于"较满"级别',
    color: 'text-violet-600 bg-violet-50 border-violet-200',
  },
]

const plans = [
  {
    id: 'A',
    label: '方案 A',
    title: '迪士尼单独安排一天',
    desc: '迪士尼作为独立的一天，体验最完整，不压缩游玩时间，强烈推荐。',
    tag: '推荐',
    intensity: '轻松',
    color: 'border-emerald-300 bg-emerald-50/50',
    tagColor: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  },
  {
    id: 'B',
    label: '方案 B',
    title: '浅草 + 涩谷 + 六本木',
    desc: '保留城市三个经典地点，作为传统城市文化路线，完全去掉迪士尼。',
    tag: '节省时间',
    intensity: '适中',
    color: 'border-sky-200 bg-sky-50/50',
    tagColor: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  {
    id: 'C',
    label: '方案 C',
    title: '半天迪士尼 + 晚上涩谷',
    desc: '上午迪士尼（只体验核心项目），晚上涩谷街区，可以打卡但整体较赶。',
    tag: '折中',
    intensity: '较满',
    color: 'border-orange-200 bg-orange-50/50',
    tagColor: 'bg-orange-100 text-orange-700 border-orange-200',
  },
]

export default function ConflictDialog({ onClose }: ConflictDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [adopted, setAdopted] = useState(false)

  const handleAdopt = (planId: string) => {
    setSelectedPlan(planId)
    setAdopted(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div
      className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card w-full max-w-lg rounded-3xl shadow-xl border border-border/60 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-base text-foreground">这一天可能会比较赶</h2>
                <p className="text-xs text-muted-foreground mt-0.5">发现 3 个潜在冲突</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-background flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* 用户需求 */}
          <div className="mt-4 bg-background rounded-xl p-3 border border-border/50">
            <div className="text-xs text-muted-foreground mb-1">你的需求</div>
            <p className="text-sm text-foreground font-medium">
              &ldquo;我想把迪士尼、浅草、涩谷和六本木都放在同一天。&rdquo;
            </p>
          </div>
        </div>

        {/* 冲突说明 */}
        <div className="px-5 py-4">
          <div className="space-y-2 mb-4">
            {conflictTypes.map(type => (
              <div key={type.label} className={cn('flex items-start gap-3 rounded-xl p-3 border', type.color)}>
                <type.icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold mb-0.5">{type.label}</div>
                  <p className="text-xs opacity-80 leading-relaxed">{type.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-4 bg-background rounded-xl p-3 border border-border/40">
            迪士尼通常需要较长停留时间，而浅草、涩谷和六本木分布在不同区域。如果全部安排在同一天，交通会压缩实际游玩时间，也不符合你希望轻松一点的偏好。
          </p>

          {/* 方案选择 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">我为你准备了 3 个方案</span>
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                推荐方案 A
              </span>
            </div>
            <div className="space-y-2">
              {plans.map(plan => (
                <div
                  key={plan.id}
                  className={cn(
                    'rounded-2xl border p-4 cursor-pointer transition-all',
                    plan.color,
                    selectedPlan === plan.id && 'ring-2 ring-primary/30'
                  )}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-foreground">{plan.label}</span>
                        <span className={cn('text-xs rounded-full px-2 py-0.5 border font-medium', plan.tagColor)}>
                          {plan.tag}
                        </span>
                        <span className={cn(
                          'text-xs rounded-full px-2 py-0.5 border font-medium',
                          plan.intensity === '轻松'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : plan.intensity === '适中'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        )}>
                          {plan.intensity}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-foreground mb-1">{plan.title}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{plan.desc}</p>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                        selectedPlan === plan.id
                          ? 'border-primary bg-primary'
                          : 'border-border'
                      )}
                    >
                      {selectedPlan === plan.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 操作按钮 */}
          {!adopted ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleAdopt(selectedPlan || 'A')}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                <Check className="w-4 h-4" />
                采用{selectedPlan ? `方案 ${selectedPlan}` : '推荐方案 A'}
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="py-2.5 rounded-xl border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:bg-background transition-all">
                  查看其他方案
                </button>
                <button
                  onClick={onClose}
                  className="py-2.5 rounded-xl border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:bg-background transition-all"
                >
                  仍然保留原计划
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl py-3">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                已采用方案 {selectedPlan}，行程更新中…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
