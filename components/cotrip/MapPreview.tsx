'use client'

import { ExternalLink, Route } from 'lucide-react'
import LeafletRouteMap from './LeafletRouteMap'
import { createMapDataFromDayPlans, createMapDataFromTripState } from '@/lib/map-adapter'
import { dayColors } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { MapDay } from '@/lib/map-adapter'
import type { DayPlan } from '@/lib/types'
import type { GeocodeStatus, TripState as MapTripState } from '@/lib/types/trip'

interface MapPreviewProps {
  plans?: DayPlan[]
  tripState?: MapTripState
  activeDayIndex?: number
}

const fallbackDayColor = { bg: 'bg-sky-100', text: 'text-sky-700', dot: '#3b82f6', line: '#93c5fd' }

function getDayColor(dayIndex: number) {
  return dayColors[dayIndex] || fallbackDayColor
}

function getActiveDay(days: MapDay[], activeDayIndex: number, selectedDayIndex?: number) {
  return days.find(day => day.dayIndex === selectedDayIndex) || days[activeDayIndex] || days[0]
}

function getIntensityClass(intensity?: string) {
  if (intensity === '轻松') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (intensity === '较满') return 'bg-rose-50 text-rose-700 border-rose-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

function getGeocodeStatusConfig(status?: GeocodeStatus) {
  if (status === 'resolved') {
    return {
      label: '已定位',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      stroke: '#059669',
    }
  }
  if (status === 'ambiguous') {
    return {
      label: '多候选',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      stroke: '#d97706',
    }
  }
  if (status === 'failed') {
    return {
      label: '定位失败',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
      stroke: '#e11d48',
    }
  }
  return {
    label: '待定位',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    stroke: '#94a3b8',
  }
}

export default function MapPreview({ plans = [], tripState, activeDayIndex = 0 }: MapPreviewProps) {
  const currentTripState = tripState
  const mapData = currentTripState
    ? createMapDataFromTripState(currentTripState)
    : createMapDataFromDayPlans(plans, activeDayIndex)
  const activeDay = getActiveDay(
    mapData.days,
    activeDayIndex,
    currentTripState ? mapData.selectedDayIndex : undefined,
  )

  if (!activeDay) {
    return (
      <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
        暂无地图点位
      </div>
    )
  }

  const mapPoints = activeDay.points
  const colors = getDayColor(activeDay.dayIndex)
  const canRenderLeaflet = mapPoints.some(point => typeof point.lat === 'number' && typeof point.lng === 'number')
  const districtLabels = Array.from(
    new Map(mapData.allPoints.map(point => [point.name, point])).values()
  ).slice(0, 12)

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">路线地图</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs rounded-full px-2.5 py-1 border font-medium', getIntensityClass(activeDay.intensity))}>
              {activeDay.intensity ? `路线强度：${activeDay.intensity}` : '地图点位'}
            </span>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: colors.dot }}
          />
          <span className="text-xs text-foreground font-medium">
            Day {activeDay.dayIndex} · {activeDay.title}
          </span>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-sky-50/30 min-h-0">
        {canRenderLeaflet && (
          <LeafletRouteMap mapData={mapData} activeDay={activeDay} color={colors.dot} />
        )}
        {!canRenderLeaflet && (
          <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)' }}
        >
          <path
            d="M 55 80 Q 65 85 80 75 Q 90 70 95 80 L 100 80 L 100 100 L 0 100 L 0 85 Q 10 80 20 82 Q 35 84 45 78 Q 50 75 55 80"
            fill="#bae6fd"
            opacity="0.6"
          />

          {[20, 35, 50, 65, 80].map(x => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" stroke="#e2e8f0" strokeWidth="0.3" />
          ))}
          {[20, 35, 50, 65, 80].map(y => (
            <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
          ))}

          <ellipse
            cx="40" cy="48" rx="22" ry="18"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            strokeDasharray="2 1.5"
          />

          {mapData.days.map(day => {
            if (day.points.length < 2) return null
            const dayColor = getDayColor(day.dayIndex)
            return day.points.slice(0, -1).map((point, i) => {
              const next = day.points[i + 1]
              return (
                <line
                  key={`route-${day.dayIndex}-${i}`}
                  x1={point.x} y1={point.y}
                  x2={next.x} y2={next.y}
                  stroke={dayColor.line}
                  strokeWidth="0.6"
                  strokeDasharray="2 1.5"
                  opacity="0.3"
                />
              )
            })
          })}

          {mapPoints.slice(0, -1).map((point, i) => {
            const next = mapPoints[i + 1]
            return (
              <line
                key={`active-route-${i}`}
                x1={point.x} y1={point.y}
                x2={next.x} y2={next.y}
                stroke={colors.dot}
                strokeWidth="1.5"
                strokeDasharray="3 2"
                strokeLinecap="round"
                className="route-line-animated"
                opacity="0.9"
              />
            )
          })}

          {districtLabels.map((point, i) => (
            <text
              key={`district-${point.id}`}
              x={point.x}
              y={point.y + 0.5}
              textAnchor="middle"
              fontSize={i < 3 ? '2.1' : i < 8 ? '1.8' : '1.5'}
              fill="#94a3b8"
              fontFamily="sans-serif"
              opacity="0.7"
            >
              {point.name}
            </text>
          ))}

          {mapData.days.map(day =>
            day.points.map(point => (
              <circle
                key={`bg-dot-${day.dayIndex}-${point.id}`}
                cx={point.x}
                cy={point.y}
                r="1"
                fill={getDayColor(day.dayIndex).line}
                opacity="0.4"
              />
            ))
          )}

          {mapData.hotel && (
            <g key={mapData.hotel.id}>
              <rect
                x={mapData.hotel.x - 2}
                y={mapData.hotel.y - 2}
                width="4"
                height="4"
                rx="1"
                fill="#0f766e"
                opacity="0.9"
              />
              <text
                x={mapData.hotel.x + 4}
                y={mapData.hotel.y + 0.6}
                fontSize="1.5"
                fill="#0f766e"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                酒店
              </text>
            </g>
          )}

          {mapPoints.map((point, i) => {
            const geocodeConfig = getGeocodeStatusConfig(point.geocodeStatus)
            const needsGeocodeAttention = point.geocodeStatus && point.geocodeStatus !== 'resolved'
            return (
            <g key={point.id}>
              <circle cx={point.x} cy={point.y} r="3" fill={colors.dot} opacity="0.2" />
              {needsGeocodeAttention && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="3.8"
                  fill="none"
                  stroke={geocodeConfig.stroke}
                  strokeWidth="0.6"
                  strokeDasharray="1.2 1"
                />
              )}
              <circle cx={point.x} cy={point.y} r="2" fill={colors.dot} />
              <text
                x={point.x}
                y={point.y + 0.7}
                textAnchor="middle"
                fontSize="1.6"
                fill="white"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                {i + 1}
              </text>
              <rect
                x={point.x + 2.5}
                y={point.y - 2}
                width={point.name.length * 1.6 + 2}
                height="4"
                rx="1.5"
                fill="white"
                stroke={colors.line}
                strokeWidth="0.5"
                opacity="0.95"
              />
              <text
                x={point.x + 3.5 + (point.name.length * 1.6) / 2}
                y={point.y + 0.5}
                textAnchor="middle"
                fontSize="1.5"
                fill="#334155"
                fontFamily="sans-serif"
              >
                {point.name}
              </text>
            </g>
            )
          })}
          </svg>
        )}

        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl border border-border/40 p-2.5 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium">各日路线</div>
          <div className="space-y-1">
            {mapData.days.slice(0, 6).map(day => (
              <div key={day.dayIndex} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-1.5 rounded-full"
                  style={{ backgroundColor: getDayColor(day.dayIndex).dot, opacity: day.dayIndex === activeDay.dayIndex ? 1 : 0.3 }}
                />
                <span
                  className={cn(
                    'text-[10px]',
                    day.dayIndex === activeDay.dayIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  Day {day.dayIndex}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border/40 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">当日地点顺序</span>
          <span className="text-xs text-muted-foreground">
            {activeDay.estimatedTransport ? `预计交通：${activeDay.estimatedTransport}` : activeDay.mainArea || '基于 TripState 点位'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {mapPoints.map((point, i) => {
            const geocodeConfig = getGeocodeStatusConfig(point.geocodeStatus)
            return (
            <div key={point.id} className="flex items-center gap-1">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                style={{ backgroundColor: colors.dot }}
              >
                {i + 1}
              </span>
              <span className="text-xs text-foreground">{point.name}</span>
              <span className={cn('text-[10px] rounded-full border px-1.5 py-0.5 font-medium', geocodeConfig.className)}>
                {geocodeConfig.label}
              </span>
              <span className="inline-flex items-center gap-1">
                {point.navigationUrl && (
                  <a
                    href={point.navigationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                    title={`${point.name} 导航`}
                  >
                    导航
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {point.xhsUrl && (
                  <a
                    href={point.xhsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-full border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600 hover:text-rose-700 transition-colors"
                    title={`小红书搜索：${point.xhsKeyword || point.name}`}
                  >
                    小红书
                  </a>
                )}
                {point.dianpingUrl && (
                  <a
                    href={point.dianpingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 hover:text-amber-800 transition-colors"
                    title={`大众点评搜索：${point.dianpingKeyword || point.name}`}
                  >
                    点评
                  </a>
                )}
              </span>
              {i < mapPoints.length - 1 && (
                <span className="text-muted-foreground text-xs">→</span>
              )}
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
