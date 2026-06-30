import type { CandidatePlace, DayIntensity, DayPlan, Place, TimeSlot } from './types'
import { createTravelLegs, createTravelMatrix, getTravelMinutes, summarizeTravelDuration } from './travel-time'

interface GenerateCandidateDrivenPlansInput {
  destination: string
  days: number
  pace: DayIntensity
  interests: string[]
  candidatePlaces: CandidatePlace[]
  fallbackPlans: DayPlan[]
  optimizeByTransport?: boolean
}

interface RouteGroup {
  key: string
  title: string
  places: CandidatePlace[]
  isFarSuburb: boolean
  travelLegs?: string[]
  estimatedTransport?: string
}

const fallbackCoordinates = [
  { x: 30, y: 45 },
  { x: 42, y: 42 },
  { x: 56, y: 46 },
  { x: 66, y: 56 },
  { x: 48, y: 62 },
  { x: 34, y: 58 },
]

function isFoodCandidate(place: CandidatePlace) {
  return place.type === 'restaurant' || place.type === 'cafe' || place.constraintTags.includes('meal_candidate')
}

function isFarSuburb(place: CandidatePlace) {
  return place.constraintTags.includes('far_suburb')
}

function isMustGo(place: CandidatePlace) {
  return place.priority === 'must_go' || place.status === 'locked'
}

function toPlanPlace(candidate: CandidatePlace, index: number): Place {
  const fallback = fallbackCoordinates[index % fallbackCoordinates.length]
  return {
    id: candidate.id,
    name: candidate.name,
    type: candidate.type === 'restaurant' || candidate.type === 'cafe'
      ? 'food'
      : candidate.type === 'shopping'
        ? 'shopping'
        : candidate.type === 'hotel'
          ? 'hotel'
          : candidate.type === 'transport'
            ? 'transport'
            : 'attraction',
    x: fallback.x,
    y: fallback.y,
  }
}

function getTokyoRouteGroup(place: CandidatePlace) {
  const text = `${place.name} ${place.areaHint || ''}`
  if (/迪士尼|富士|箱根/.test(text)) return '远郊主题日'
  if (/浅草|上野|清澄白河|博物馆/.test(text)) return '东京东侧'
  if (/原宿|表参道|涩谷|代官山|新宿/.test(text)) return '东京西侧'
  if (/银座|筑地|东京塔|台场/.test(text)) return '银座与湾岸'
  return place.areaHint || '城市核心区'
}

function getChengduRouteGroup(place: CandidatePlace) {
  const text = `${place.name} ${place.areaHint || ''}`
  if (/熊猫/.test(text)) return '城北熊猫基地'
  if (/太古里|春熙路|人民公园|宽窄/.test(text)) return '市中心慢游'
  if (/武侯祠|锦里|杜甫/.test(text)) return '文化经典线'
  return place.areaHint || '成都核心区'
}

function getRouteGroup(destination: string, place: CandidatePlace) {
  if (isFarSuburb(place)) return `${place.name}独立日`
  if (destination === '东京') return getTokyoRouteGroup(place)
  if (destination === '成都') return getChengduRouteGroup(place)
  return place.areaHint || place.name
}

function createGroups(destination: string, candidates: CandidatePlace[]) {
  const groups = new Map<string, RouteGroup>()

  candidates.forEach(place => {
    const key = getRouteGroup(destination, place)
    const existing = groups.get(key)
    if (existing) {
      existing.places.push(place)
      existing.isFarSuburb = existing.isFarSuburb || isFarSuburb(place)
      return
    }

    groups.set(key, {
      key,
      title: key,
      places: [place],
      isFarSuburb: isFarSuburb(place),
    })
  })

  return Array.from(groups.values()).sort((a, b) => {
    if (a.isFarSuburb && !b.isFarSuburb) return 1
    if (!a.isFarSuburb && b.isFarSuburb) return -1
    const aMust = a.places.some(isMustGo)
    const bMust = b.places.some(isMustGo)
    if (aMust && !bMust) return -1
    if (!aMust && bMust) return 1
    return 0
  })
}

function createTransportOptimizedGroups(candidates: CandidatePlace[], pace: DayIntensity) {
  const matrix = createTravelMatrix(candidates)
  const cityCandidates = candidates.filter(place => !isFarSuburb(place))
  const farCandidates = candidates.filter(isFarSuburb)
  const maxGroupSize = pace === '轻松' ? 2 : 3
  const groups: RouteGroup[] = []
  const unassigned = [...cityCandidates]

  while (unassigned.length > 0) {
    const seed = unassigned.shift()
    if (!seed) break
    const places = [seed]

    while (places.length < maxGroupSize && unassigned.length > 0) {
      const last = places[places.length - 1]
      const nearest = unassigned
        .map(place => ({ place, minutes: getTravelMinutes(matrix, last, place) }))
        .sort((a, b) => a.minutes - b.minutes)[0]
      if (!nearest) break
      if (nearest.minutes > 42 && places.length > 1) break
      unassigned.splice(unassigned.findIndex(place => place.id === nearest.place.id), 1)
      places.push(nearest.place)
    }

    const legs = createTravelLegs(matrix, places)
    groups.push({
      key: places.map(place => place.name).join('-'),
      title: places.slice(0, 2).map(place => place.name).join(' + '),
      places,
      isFarSuburb: false,
      travelLegs: legs.map(leg => leg.label),
      estimatedTransport: summarizeTravelDuration(matrix, places),
    })
  }

  farCandidates.forEach(place => {
    groups.push({
      key: `${place.name}-far-suburb`,
      title: `${place.name}独立日`,
      places: [place],
      isFarSuburb: true,
      travelLegs: ['往返交通约 60-120 分钟，建议提前确认末班车和返程方式'],
      estimatedTransport: '约 60-120 分钟（往返）',
    })
  })

  return groups
}

function getMainPlaceNames(places: CandidatePlace[]) {
  return places
    .filter(place => !isFoodCandidate(place))
    .map(place => place.name)
    .slice(0, 3)
}

function getFoodText(foodCandidates: CandidatePlace[]) {
  if (foodCandidates.length === 0) return '按当天区域补一个顺路餐厅'
  return `按当天区域补充${foodCandidates.map(place => place.name).slice(0, 2).join(' / ')}候选`
}

function createSlots(group: RouteGroup, foodCandidates: CandidatePlace[]): TimeSlot[] {
  const mainNames = getMainPlaceNames(group.places)
  const first = mainNames[0] || group.title
  const second = mainNames[1]
  const third = mainNames[2]

  if (group.isFarSuburb) {
    return [
      { period: '全天', activities: [`${first}单独安排一天`, '提前确认门票、开放时间和返程交通'] },
      { period: '晚上', activities: ['返回住宿区域休息', '不再追加高强度活动'] },
    ]
  }

  return [
    { period: '上午', activities: [second ? `${first} → ${second}` : `${first}深度游览`, group.travelLegs?.[0] || '优先安排核心锚点'] },
    { period: '下午', activities: [third ? `前往${third}` : `${group.title}周边顺路探索`, group.travelLegs?.[1] || '保留咖啡/休息弹性'] },
    { period: '晚上', activities: [getFoodText(foodCandidates), '根据体力决定是否增加夜间散步'] },
  ]
}

function distanceKm(a: CandidatePlace, b: CandidatePlace) {
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lat !== 'number' || typeof b.lng !== 'number') return 0
  const latKm = (a.lat - b.lat) * 111
  const lngKm = (a.lng - b.lng) * 88
  return Math.sqrt(latKm * latKm + lngKm * lngKm)
}

function estimateTransport(group: RouteGroup) {
  if (group.estimatedTransport) return group.estimatedTransport
  if (group.isFarSuburb) return '约 60-120 分钟（往返）'
  const routePlaces = group.places.filter(place => !isFoodCandidate(place))
  const totalKm = routePlaces.slice(0, -1).reduce((sum, place, index) => sum + distanceKm(place, routePlaces[index + 1]), 0)
  if (!totalKm) return routePlaces.length <= 2 ? '约 20-35 分钟' : '约 35-55 分钟'
  const minutes = Math.round(Math.min(85, Math.max(18, totalKm * 9 + (routePlaces.length - 1) * 8)))
  return `约 ${Math.max(15, minutes - 8)}-${minutes + 8} 分钟`
}

function createReason(group: RouteGroup, foodCandidates: CandidatePlace[]) {
  const tagNotes = [
    group.places.some(place => place.constraintTags.includes('reservation_required')) ? '含需预约点，建议提前确认票务' : '',
    group.places.some(place => place.constraintTags.includes('weather_sensitive')) ? '含天气敏感点，适合准备室内备选' : '',
    group.places.some(place => place.constraintTags.includes('crowded_on_holiday')) ? '热门点可能拥挤，建议错峰' : '',
  ].filter(Boolean)

  if (group.isFarSuburb) {
    return `${group.title}距离主城区较远，按约束规则单独成天，避免压缩其他市区景点体验。${tagNotes.join('；')}`
  }

  const transportNote = group.travelLegs?.length ? `交通估算：${group.travelLegs.join('；')}。` : ''
  return `根据用户提到的地点，把${getMainPlaceNames(group.places).join('、') || group.title}合并为同一区域路线，减少跨区移动。${transportNote}餐饮只作为顺路补给：${getFoodText(foodCandidates)}。${tagNotes.join('；')}`
}

function createPlanFromGroup(group: RouteGroup, day: number, days: number, pace: DayIntensity, foodCandidates: CandidatePlace[]): DayPlan {
  const placeNames = getMainPlaceNames(group.places)
  const intensity: DayIntensity = group.isFarSuburb
    ? '较满'
    : day === 1 || day === days
      ? '轻松'
      : pace

  return {
    day,
    title: group.isFarSuburb ? group.title : placeNames.slice(0, 2).join(' + ') || group.title,
    theme: group.isFarSuburb ? '远郊/主题乐园独立日' : `${group.title}集中路线`,
    intensity,
    slots: createSlots(group, foodCandidates),
    reason: createReason(group, foodCandidates),
    places: group.places.filter(place => !isFoodCandidate(place)).map(toPlanPlace),
    estimatedTransport: estimateTransport(group),
  }
}

function createFlexibleFillerPlan(destination: string, day: number, pace: DayIntensity, interests: string[]): DayPlan {
  const intensity: DayIntensity = day === 1 ? '轻松' : pace === '较满' ? '适中' : pace
  const interestText = interests.length > 0 ? interests.slice(0, 2).join('、') : '城市街区'

  return {
    day,
    title: `${destination}弹性补充`,
    theme: '候选地点外的弹性补充日',
    intensity,
    slots: [
      { period: '上午', activities: ['保留休息或补充一个顺路景点', '根据前几天体力决定是否加点'] },
      { period: '下午', activities: [`围绕${interestText}补充轻量安排`, '优先选择住宿或当日主区域附近'] },
      { period: '晚上', activities: ['自由晚餐或轻松散步', '不安排高强度跨区移动'] },
    ],
    reason: '候选地点已经按交通时间完成主要分组，这一天先作为弹性补充日，避免为了填满天数而强行复制前几天路线。',
    places: [],
    estimatedTransport: '约 15-30 分钟',
  }
}

function createFillerPlans(
  destination: string,
  days: number,
  existingPlans: DayPlan[],
  fallbackPlans: DayPlan[],
  pace: DayIntensity,
  interests: string[],
) {
  const existingDays = new Set(existingPlans.map(plan => plan.day))
  const usedTitles = new Set(existingPlans.map(plan => plan.title))
  const usedPlaceNames = new Set(existingPlans.flatMap(plan => plan.places.map(place => place.name)))
  const fillers: DayPlan[] = []

  for (let day = 1; day <= days; day += 1) {
    if (existingDays.has(day)) continue
    const fallback = fallbackPlans.find(plan => {
      const overlapsUsedPlace = plan.places.some(place => usedPlaceNames.has(place.name))
      return plan.day === day && !usedTitles.has(plan.title) && !overlapsUsedPlace
    })
    if (fallback) {
      fallback.places.forEach(place => usedPlaceNames.add(place.name))
      usedTitles.add(fallback.title)
      fillers.push({
        ...fallback,
        day,
        reason: `${fallback.reason} 这一日保留为用户新增地点之外的补充安排，避免交通重排后行程天数缺口。`,
      })
    } else {
      fillers.push(createFlexibleFillerPlan(destination, day, pace, interests))
    }
  }

  return fillers
}

export function generateCandidateDrivenPlans({
  destination,
  days,
  pace,
  interests,
  candidatePlaces,
  fallbackPlans,
  optimizeByTransport = false,
}: GenerateCandidateDrivenPlansInput): DayPlan[] {
  const activeCandidates = candidatePlaces.filter(place => place.status !== 'excluded')
  const foodCandidates = activeCandidates.filter(isFoodCandidate)
  const routeCandidates = activeCandidates.filter(place => !isFoodCandidate(place))

  if (routeCandidates.length === 0) return fallbackPlans

  const importantRouteCandidates = routeCandidates.filter(place => !isFarSuburb(place) || isMustGo(place) || days >= 4)
  const groups = optimizeByTransport
    ? createTransportOptimizedGroups(importantRouteCandidates, pace)
    : createGroups(destination, importantRouteCandidates)
  const plannedGroups = groups.slice(0, days)
  const plans = plannedGroups.map((group, index) => createPlanFromGroup(group, index + 1, days, pace, foodCandidates))

  if (plans.length >= days) return plans

  const fillerPlans = createFillerPlans(destination, days, plans, fallbackPlans, pace, interests)

  return [...plans, ...fillerPlans].slice(0, days)
}
