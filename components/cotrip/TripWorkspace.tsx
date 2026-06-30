'use client'

import { useEffect, useRef, useState } from 'react'
import { Plane, Download, Map as MapIcon, MessageCircle, List } from 'lucide-react'
import ChatPanel from './ChatPanel'
import ItineraryCard from './ItineraryCard'
import MapPreview from './MapPreview'
import type { ChatMessage, DayPlan, ParseResult, TripSession, TripState } from '@/lib/types'
import type { ItineraryCommandApiResponse } from '@/lib/itinerary-command-api'
import type { RoutePlanApiResponse } from '@/lib/route-plan-api'
import type { TravelTaskApiResponse } from '@/lib/travel-task-api'
import { createMapTripStateFromLegacyTripState } from '@/lib/map-adapter'
import { extractCandidatePlaces } from '@/lib/trip-candidates'
import { createTripStateFromSession, processParsedFeedback, processUserFeedback } from '@/lib/trip-state'
import { generateCandidateDrivenPlans } from '@/lib/trip-route-planner'
import { normalizeTravelTaskFrame, parseLocalTravelTask } from '@/lib/travel-task-frame'
import { travelTaskToParseResult } from '@/lib/travel-task-planner'
import { cn } from '@/lib/utils'

interface TripWorkspaceProps {
  session: TripSession
  onPlansChange: (plans: DayPlan[]) => void
  onExport: () => void
}

type TabType = 'chat' | 'itinerary' | 'map'

interface TripHistoryItem {
  state: TripState
  updatedDays: number[]
}

interface LastChange {
  day: number
  beforePlaces: string[]
  afterPlaces: string[]
}

type ResizeHandle = 'left' | 'right'

const defaultColumnSizes = {
  left: 280,
  right: 320,
}

const columnSizeStorageKey = 'cotrip-workspace-column-sizes'
const minColumnSizes = {
  left: 220,
  center: 420,
  right: 280,
}
const maxColumnSizes = {
  left: 520,
  right: 640,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isTransportReplanRequest(input: string) {
  return /(重新规划|重新安排|重排|排一下|规划下|怎么走|最顺|顺路|方便出行|交通|通行时间|通勤)/.test(input)
}

function mergeCandidatePlaces(existing: TripState['candidatePlaces'], incoming: TripState['candidatePlaces']) {
  const map = new Map(existing.map(place => [place.name, place]))
  incoming.forEach(place => {
    const current = map.get(place.name)
    map.set(place.name, current ? { ...current, ...place, status: current.status === 'excluded' ? place.status : current.status } : place)
  })
  return Array.from(map.values())
}

export default function TripWorkspace({ session, onPlansChange, onExport }: TripWorkspaceProps) {
  const [tripState, setTripState] = useState<TripState>(() => createTripStateFromSession(session))
  const [history, setHistory] = useState<TripHistoryItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>(session.initialMessages)
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [updatedDays, setUpdatedDays] = useState<number[]>([])
  const [lastChange, setLastChange] = useState<LastChange | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('itinerary')
  const [loadingText, setLoadingText] = useState('')
  const messageIdRef = useRef(0)
  const desktopGridRef = useRef<HTMLDivElement | null>(null)
  const [columnSizes, setColumnSizes] = useState(() => {
    if (typeof window === 'undefined') return defaultColumnSizes
    try {
      const storedSizes = window.localStorage.getItem(columnSizeStorageKey)
      if (!storedSizes) return defaultColumnSizes
      const parsed = JSON.parse(storedSizes) as Partial<typeof defaultColumnSizes>
      if (typeof parsed.left !== 'number' || typeof parsed.right !== 'number') return defaultColumnSizes
      return {
        left: clamp(parsed.left, minColumnSizes.left, maxColumnSizes.left),
        right: clamp(parsed.right, minColumnSizes.right, maxColumnSizes.right),
      }
    } catch {
      return defaultColumnSizes
    }
  })
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null)
  const isLoading = loadingText.length > 0

  useEffect(() => {
    window.localStorage.setItem(columnSizeStorageKey, JSON.stringify(columnSizes))
  }, [columnSizes])

  const startResize = (handle: ResizeHandle) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const grid = desktopGridRef.current
    if (!grid) return

    const bounds = grid.getBoundingClientRect()
    const initialSizes = columnSizes
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    setActiveResizeHandle(handle)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const totalWidth = bounds.width
      const availableLeftMax = totalWidth - initialSizes.right - minColumnSizes.center
      const availableRightMax = totalWidth - initialSizes.left - minColumnSizes.center

      if (handle === 'left') {
        const nextLeft = moveEvent.clientX - bounds.left
        setColumnSizes(current => ({
          ...current,
          left: clamp(nextLeft, minColumnSizes.left, Math.min(maxColumnSizes.left, availableLeftMax)),
        }))
        return
      }

      const nextRight = bounds.right - moveEvent.clientX
      setColumnSizes(current => ({
        ...current,
        right: clamp(nextRight, minColumnSizes.right, Math.min(maxColumnSizes.right, availableRightMax)),
      }))
    }

    const stopResize = () => {
      setActiveResizeHandle(null)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  const createMessageId = () => {
    messageIdRef.current += 1
    return `generated-message-${messageIdRef.current}`
  }

  const syncTripState = (nextState: TripState) => {
    setTripState(nextState)
    onPlansChange(nextState.itinerary)
  }

  const appendMessage = (role: ChatMessage['role'], content: string, id = createMessageId()) => {
    const message: ChatMessage = { id, role, content }
    setMessages(prev => [...prev, message])
  }

  const resolveParseResult = async (msg: string, state: TripState): Promise<ParseResult> => {
    const localParseResult = processUserFeedback(msg, state).parseResult
    const localTravelTaskResult = travelTaskToParseResult(
      normalizeTravelTaskFrame(parseLocalTravelTask(msg, state), state),
      state,
    )

    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      const response = await fetch('/api/travel-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input: msg, tripState: state }),
          signal: controller.signal,
        })
        .finally(() => window.clearTimeout(timeout))

      if (!response.ok) throw new Error('Travel task API request failed')
      const data = (await response.json()) as TravelTaskApiResponse
      const taskParseResult = travelTaskToParseResult(data.task, state)
      if (taskParseResult.actionMode !== 'clarify' && taskParseResult.actionMode !== 'record') return taskParseResult
      if (localTravelTaskResult.actionMode !== 'clarify' && localTravelTaskResult.actionMode !== 'record') return localTravelTaskResult
      if (localParseResult.actionMode !== 'clarify') return localParseResult

      const legacyResponse = await fetch('/api/itinerary-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: msg, tripState: state }),
      })
      if (!legacyResponse.ok) return taskParseResult
      const legacyData = (await legacyResponse.json()) as ItineraryCommandApiResponse
      if (legacyData.parseResult.actionMode === 'clarify' && localTravelTaskResult.actionMode !== 'clarify') return localTravelTaskResult
      return legacyData.parseResult
    } catch {
      if (localTravelTaskResult.actionMode !== 'clarify' && localTravelTaskResult.actionMode !== 'record') return localTravelTaskResult
      return localParseResult
    }
  }

  const handleSendMessage = (msg: string) => {
    if (isLoading) return

    appendMessage('user', msg)
    if (handleTransportReplanMessage(msg)) return

    const pendingResult = processUserFeedback(msg, tripState)
    const targetDay = pendingResult.commands.find(command => command.target?.day)?.target?.day
    setLoadingText(targetDay ? `正在调整 Day ${targetDay} 行程...` : '正在理解你的修改意见...')

    void (async () => {
      const beforeState = tripState
      const parseResult = await resolveParseResult(msg, beforeState)
      const result = processParsedFeedback(msg, beforeState, parseResult)
      const validation = result.validation
      const aiResult = result.aiResult
      const nextState = result.nextState
      const changedDays = validation.changedDays
      const stateChanged = JSON.stringify(beforeState) !== JSON.stringify(nextState)
      const effectiveChangedDays = changedDays.length > 0 ? changedDays : stateChanged && targetDay ? [targetDay] : []
      const day = effectiveChangedDays[0]
      const beforePlaces = day
        ? beforeState.itinerary.find(plan => plan.day === day)?.places.map(place => place.name) || []
        : []
      const afterPlaces = day
        ? nextState.itinerary.find(plan => plan.day === day)?.places.map(place => place.name) || []
        : []

      if (validation.ok && stateChanged) {
        setHistory(prev => [{ state: beforeState, updatedDays }, ...prev].slice(0, 8))
        syncTripState(nextState)
      }

      appendMessage('ai', aiResult.reply, validation.ok && stateChanged && day ? `patch-day-${day}-${Date.now()}` : createMessageId())

      if (validation.ok && stateChanged && day) {
        setUpdatedDays(prev => Array.from(new Set([...prev, ...effectiveChangedDays])))
        setActiveDayIndex(Math.max(0, day - 1))
        setActiveTab('itinerary')
        setLastChange({ day, beforePlaces, afterPlaces })
      } else if (validation.ok) {
        if (!stateChanged) setUpdatedDays([])
        setLastChange(null)
      }

      setLoadingText('')
    })()
  }

  const handleTransportReplanMessage = (msg: string) => {
    if (!isTransportReplanRequest(msg)) return false

    const extractedPlaces = extractCandidatePlaces(msg, tripState.destination)
    const routePlaces = extractedPlaces.filter(place => place.type !== 'restaurant' && place.type !== 'cafe')
    if (routePlaces.length < 2) return false

    setLoadingText('正在结合交通和时间约束重新规划...')

    void (async () => {
      const beforeState = tripState
      const mergedPlaces = mergeCandidatePlaces(beforeState.candidatePlaces, extractedPlaces)
      let nextPlans: DayPlan[]
      let reply: string

      try {
        const response = await fetch('/api/route-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: msg,
            tripState: {
              ...beforeState,
              candidatePlaces: mergedPlaces,
            },
          }),
        })

        if (!response.ok) throw new Error('Route plan API request failed')
        const data = (await response.json()) as RoutePlanApiResponse
        nextPlans = data.plans
        reply = data.reply
      } catch {
        nextPlans = generateCandidateDrivenPlans({
          destination: beforeState.destination,
          days: beforeState.days,
          pace: beforeState.pace,
          interests: beforeState.preferences,
          candidatePlaces: mergedPlaces,
          fallbackPlans: beforeState.itinerary,
          optimizeByTransport: true,
        })
        reply = '我先按地点位置和交通便利性生成一版路线草案：相邻区域优先合并，尽量减少跨区折返。模型规划接口暂时不可用时，会先用这版草案保持行程和地图同步。'
      }

      const nextState: TripState = {
        ...beforeState,
        candidatePlaces: mergedPlaces,
        itinerary: nextPlans,
      }

      setHistory(prev => [{ state: beforeState, updatedDays }, ...prev].slice(0, 8))
      syncTripState(nextState)
      setUpdatedDays(nextPlans.map(plan => plan.day))
      setActiveDayIndex(0)
      setActiveTab('itinerary')
      setLastChange(null)
      appendMessage('ai', reply)
      setLoadingText('')
    })()

    return true
  }

  const handleQuickAction = (actionId: string) => {
    const actionMessages: Record<string, string> = {
      'too-full': 'Day 3 太满了，帮我轻松一点',
      relax: '整体帮我再轻松一点',
      'change-place': '第一天不想去浅草，换一个地方',
      why: '为什么这样安排区域顺序？',
      'more-food': '帮我每天增加一个特色餐厅推荐',
      'less-budget': '按低预算重新规划一下',
    }
    handleSendMessage(actionMessages[actionId] || actionId)
  }

  const handleUndo = () => {
    const latest = history[0]
    if (!latest || isLoading) return

    syncTripState(latest.state)
    setUpdatedDays(latest.updatedDays)
    setHistory(prev => prev.slice(1))
    setLastChange(null)
    appendMessage('ai', '已撤销最近一次修改，行程卡片和地图已恢复到上一步。')
  }

  const tabs = [
    { id: 'chat' as TabType, label: 'AI 对话', icon: MessageCircle },
    { id: 'itinerary' as TabType, label: '行程', icon: List },
    { id: 'map' as TabType, label: '地图', icon: MapIcon },
  ]
  const activeMapDayIndex = Math.min(activeDayIndex, Math.max(0, tripState.itinerary.length - 1))
  const mapTripState = createMapTripStateFromLegacyTripState(tripState, activeMapDayIndex + 1)
  const updatedDayLabel = updatedDays.length > 0 ? `Day ${updatedDays[updatedDays.length - 1]} 已更新` : ''

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/50 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Plane className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-base text-foreground">CoTrip AI</span>
          <span className="hidden md:inline text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
            {session.title}
          </span>
        </div>

        {/* 移动端 Tab */}
        <div className="flex md:hidden items-center gap-1 bg-background rounded-xl border border-border/50 p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={onExport}
          className="hidden md:flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Download className="w-4 h-4" />
          确认并导出行程
        </button>
        <button
          onClick={onExport}
          className="md:hidden flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          导出
        </button>
      </header>

      {/* 主体三栏（桌面端） / 单栏 Tab（移动端） */}
      <div className="flex-1 overflow-hidden">
        {/* 桌面端三栏 */}
        <div
          ref={desktopGridRef}
          className="hidden md:grid h-full"
          style={{
            gridTemplateColumns: `${columnSizes.left}px 10px minmax(${minColumnSizes.center}px, 1fr) 10px ${columnSizes.right}px`,
          }}
        >
          {/* 左侧：AI 对话 */}
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onQuickAction={handleQuickAction}
            updatedDays={updatedDays}
            isLoading={isLoading}
            loadingText={loadingText}
            canUndo={history.length > 0}
            onUndo={handleUndo}
          />

          <button
            type="button"
            aria-label="调整对话栏宽度"
            onPointerDown={startResize('left')}
            className={cn(
              'group relative h-full cursor-col-resize bg-transparent transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              activeResizeHandle === 'left' && 'bg-primary/20'
            )}
          >
            <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/70 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>

          {/* 中间：行程卡片 */}
          <div className="overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 z-10 border-b border-border/30">
              <div>
                <h2 className="font-heading font-bold text-base text-foreground">{tripState.destination} {tripState.days} 日行程</h2>
                <p className="text-xs text-muted-foreground">{tripState.pace}自由行 · 可随时修改</p>
              </div>
              {updatedDayLabel && (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 font-medium">
                  {updatedDayLabel}
                </span>
              )}
            </div>

            {tripState.itinerary.map((plan, i) => (
              <ItineraryCard
                key={plan.day}
                plan={plan}
                isActive={activeMapDayIndex === i}
                isUpdated={updatedDays.includes(plan.day)}
                onClick={() => setActiveDayIndex(i)}
              />
            ))}

            {/* 修改对比卡片 */}
            {lastChange && (
              <div className="bg-card rounded-2xl border border-emerald-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700">Day {lastChange.day} 修改对比</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-100">
                    <div className="text-xs font-medium text-rose-700 mb-1.5">修改前 · {lastChange.beforePlaces.length} 个地点</div>
                    <div className="space-y-1">
                      {lastChange.beforePlaces.map((place, i) => (
                        <div key={place} className="flex items-center gap-1.5 text-xs text-rose-600">
                          <span className="w-4 h-4 rounded-full bg-rose-200 text-rose-700 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className={!lastChange.afterPlaces.includes(place) ? 'line-through opacity-60' : ''}>{place}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
                    <div className="text-xs font-medium text-emerald-700 mb-1.5">修改后 · {lastChange.afterPlaces.length} 个地点</div>
                    <div className="space-y-1">
                      {lastChange.afterPlaces.map((place, i) => (
                        <div key={place} className="flex items-center gap-1.5 text-xs text-emerald-700">
                          <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-700 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                          {place}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="调整地图栏宽度"
            onPointerDown={startResize('right')}
            className={cn(
              'group relative h-full cursor-col-resize bg-transparent transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              activeResizeHandle === 'right' && 'bg-primary/20'
            )}
          >
            <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/70 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>

          {/* 右侧：地图 */}
          <MapPreview tripState={mapTripState} activeDayIndex={activeMapDayIndex} />
        </div>

        {/* 移动端单栏 */}
        <div className="md:hidden h-full overflow-hidden">
          {activeTab === 'chat' && (
            <div className="h-full">
              <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                onQuickAction={handleQuickAction}
                updatedDays={updatedDays}
                isLoading={isLoading}
                loadingText={loadingText}
                canUndo={history.length > 0}
                onUndo={handleUndo}
              />
            </div>
          )}
          {activeTab === 'itinerary' && (
            <div className="h-full overflow-y-auto p-4 space-y-3">
              {tripState.itinerary.map((plan, i) => (
                <ItineraryCard
                  key={plan.day}
                  plan={plan}
                  isActive={activeMapDayIndex === i}
                  isUpdated={updatedDays.includes(plan.day)}
                  onClick={() => { setActiveDayIndex(i); setActiveTab('map') }}
                />
              ))}
            </div>
          )}
          {activeTab === 'map' && (
            <div className="h-full">
              <MapPreview tripState={mapTripState} activeDayIndex={activeMapDayIndex} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
