import { extractCandidatePlaces } from './trip-candidates'
import type { TimeIntent, TripState } from './types'

export type TravelTaskTypeV2 =
  | 'add_must_go_place'
  | 'remove_place'
  | 'replace_day'
  | 'adjust_pace'
  | 'add_food_request'
  | 'update_transport_boundary'
  | 'update_hotel'
  | 'reroute_by_transport'
  | 'ask_why'
  | 'clarify'
  | 'record'
  | 'unsupported'

export interface TravelTaskFrameV2 {
  taskType: TravelTaskTypeV2
  confidence: number
  needsClarification: boolean
  userIntentSummary: string
  target: {
    day?: number
    place?: string
    timeSlot?: TimeIntent
  }
  constraints: {
    needsFullDay?: boolean
    avoidFirstDay?: boolean
    avoidDepartureDay?: boolean
    routePreference?: 'same_area' | 'minimal_detour' | 'transport_optimized'
    pace?: 'relaxed' | 'normal' | 'intense'
    reason?: string
  }
  payload: {
    theme?: string
    category?: 'restaurant' | 'cafe' | 'shopping' | 'sightseeing' | 'experience' | 'rest'
    places?: string[]
    avoidPlaces?: string[]
    note?: string
  }
  rawUserInput: string
}

const farSuburbOrFullDayPlaces = ['迪士尼', '东京迪士尼', '环球影城', '大阪环球影城', '富士山', '箱根']
const knownPlaceNames = [
  '迪士尼', '东京迪士尼', '环球影城', '富士山', '箱根',
  '浅草', '浅草寺', '上野', '上野公园', '原宿', '表参道', '涩谷', '涩谷Sky', '银座', '筑地', '台场', '代官山',
  '新宿', '东京塔', '清澄白河',
  '太古里', '春熙路', '宽窄巷子', '锦里', '武侯祠', '人民公园', '熊猫基地',
]

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function isFullDayPlace(place?: string) {
  return Boolean(place && farSuburbOrFullDayPlaces.some(item => place.includes(item) || item.includes(place)))
}

function extractDay(input: string) {
  const numberMatch = input.match(/(?:day\s*)?(\d{1,2})|第\s*([一二两三四五六七八九十])\s*天/i)
  if (numberMatch?.[1]) return Number(numberMatch[1])
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return numberMatch?.[2] ? map[numberMatch[2]] : undefined
}

function extractTimeSlot(input: string): TimeIntent | undefined {
  if (/早餐|早饭/.test(input)) return 'breakfast'
  if (/午餐|中午|午饭/.test(input)) return 'lunch'
  if (/下午茶/.test(input)) return 'tea_time'
  if (/下午/.test(input)) return 'afternoon'
  if (/晚餐|晚饭|晚上/.test(input)) return 'dinner'
  if (/上午|早上/.test(input)) return 'morning'
  return undefined
}

function extractDayTheme(input: string) {
  const patterns = [
    /(?:安排成|规划成|设置成|改成|换成|变成|做成)\s*([^，。,.、]+?)(?:主题日|主题|路线|一日|一天|$)/,
    /([^，。,.、]{2,12}?)(?:主题日|主题)(?:安排|路线|$)/,
  ]
  for (const pattern of patterns) {
    const match = input.match(pattern)
    const theme = match?.[1]?.replace(/^(一个|一版|我的|轻松的|好玩的)/, '').trim()
    if (theme) return theme
  }
  return undefined
}

function canonicalizePlaceName(place: string) {
  if (place.includes('迪士尼')) return '迪士尼'
  if (place.includes('环球影城')) return place.includes('大阪') ? '大阪环球影城' : '环球影城'
  if (place.includes('富士山')) return '富士山'
  if (place.includes('箱根')) return '箱根'
  return place
}

function extractPlaces(input: string, tripState: TripState) {
  const itineraryPlaces = tripState.itinerary.flatMap(day => day.places.map(place => place.name))
  const candidatePlaces = extractCandidatePlaces(input, tripState.destination).map(place => place.name)
  return uniqueValues([...knownPlaceNames, ...itineraryPlaces, ...candidatePlaces])
    .sort((a, b) => b.length - a.length)
    .filter(place => input.includes(place))
    .map(canonicalizePlaceName)
}

function pickPositiveTargetPlace(places: string[]) {
  const fullDayPlace = places.find(isFullDayPlace)
  return fullDayPlace || places.find(place => place !== '酒店')
}

function getAvoidPlacesForCompoundTask(places: string[], targetPlace?: string) {
  return places.filter(place => (
    place !== '酒店' &&
    place !== targetPlace &&
    !isFullDayPlace(place)
  ))
}

function createTask(input: string, patch: Partial<TravelTaskFrameV2>): TravelTaskFrameV2 {
  return {
    taskType: patch.taskType || 'record',
    confidence: clampConfidence(patch.confidence ?? 0.74),
    needsClarification: patch.needsClarification ?? false,
    userIntentSummary: patch.userIntentSummary || input,
    target: patch.target || {},
    constraints: patch.constraints || {},
    payload: patch.payload || {},
    rawUserInput: input,
  }
}

export function parseLocalTravelTask(input: string, tripState: TripState): TravelTaskFrameV2 {
  const trimmed = input.trim()
  const day = extractDay(trimmed)
  const timeSlot = extractTimeSlot(trimmed)
  const places = extractPlaces(trimmed, tripState)
  const primaryPlace = pickPositiveTargetPlace(places)
  const avoidPlaces = getAvoidPlacesForCompoundTask(places, primaryPlace)
  const dayTheme = extractDayTheme(trimmed)
  const wantsAdd = /增加|新增|添加|加入|加到|放进|放入|想去|还想去|也想去|安排.*去/.test(trimmed)
  const wantsRemove = /不想去|不去|不感兴趣|删除|删掉|取消|避开/.test(trimmed)
  const wantsAvoidCategory = /寺庙|寺|神社|商业|商场/.test(trimmed) && /不想|不去|不要|避开|不感兴趣/.test(trimmed)
  const wantsReplace = /换成|改成|替换|换掉|重新安排/.test(trimmed)
  const wantsReroute = /交通|通勤|顺路|怎么走|路线|重新规划|重排|方便出行/.test(trimmed)
  const asksWhy = /为什么|为啥|原因|解释/.test(trimmed)
  const wantsFood = /餐厅|吃饭|午餐|晚餐|美食|咖啡|下午茶/.test(trimmed)
  const wantsRelax = /轻松|别太赶|慢一点|休息|太满/.test(trimmed)
  const transportBoundary = /机场|落地|抵达|返程|航班|飞机|起飞/.test(trimmed)

  if (asksWhy) {
    return createTask(trimmed, {
      taskType: 'ask_why',
      confidence: 0.86,
      userIntentSummary: '用户想了解当前路线安排原因',
      payload: { note: trimmed },
    })
  }

  if (transportBoundary && !wantsReroute && !primaryPlace) {
    return createTask(trimmed, {
      taskType: 'update_transport_boundary',
      confidence: 0.82,
      userIntentSummary: '用户补充落地或返程交通边界',
      payload: { note: trimmed },
    })
  }

  if (wantsReroute && places.length >= 2) {
    return createTask(trimmed, {
      taskType: 'reroute_by_transport',
      confidence: 0.86,
      userIntentSummary: '用户希望按交通便利性重新规划路线',
      constraints: { routePreference: 'transport_optimized' },
      payload: { places },
    })
  }

  if (wantsAvoidCategory) {
    return createTask(trimmed, {
      taskType: 'record',
      confidence: 0.68,
      userIntentSummary: '用户提出类型避开和替代偏好，交由 legacy patch parser 处理',
      payload: { note: trimmed },
    })
  }

  if (day && dayTheme) {
    return createTask(trimmed, {
      taskType: 'replace_day',
      confidence: 0.9,
      userIntentSummary: `用户希望 Day ${day} 改为${dayTheme}主题日`,
      target: { day, place: dayTheme },
      constraints: {
        needsFullDay: true,
        avoidFirstDay: false,
        avoidDepartureDay: false,
      },
      payload: { theme: dayTheme, places: [dayTheme] },
    })
  }

  if (wantsRemove && wantsAdd && day && primaryPlace && avoidPlaces.length > 0) {
    return createTask(trimmed, {
      taskType: 'add_must_go_place',
      confidence: 0.9,
      userIntentSummary: `用户希望 Day ${day} 避开${avoidPlaces.join('、')}，改去${primaryPlace}`,
      target: { day, place: primaryPlace, timeSlot },
      constraints: {
        needsFullDay: isFullDayPlace(primaryPlace),
        avoidFirstDay: isFullDayPlace(primaryPlace),
        avoidDepartureDay: isFullDayPlace(primaryPlace),
        reason: isFullDayPlace(primaryPlace) ? `${primaryPlace}通常需要单独安排一整天` : undefined,
      },
      payload: { theme: primaryPlace, places: [primaryPlace], avoidPlaces },
    })
  }

  if (wantsRemove && primaryPlace) {
    return createTask(trimmed, {
      taskType: 'remove_place',
      confidence: 0.87,
      userIntentSummary: `用户不想去${primaryPlace}`,
      target: { day, place: primaryPlace },
      payload: { avoidPlaces: [primaryPlace] },
    })
  }

  if ((wantsReplace || /第.+天.*去/.test(trimmed)) && day && primaryPlace) {
    return createTask(trimmed, {
      taskType: 'replace_day',
      confidence: 0.88,
      userIntentSummary: `用户希望 Day ${day} 改为${primaryPlace}`,
      target: { day, place: primaryPlace },
      constraints: {
        needsFullDay: isFullDayPlace(primaryPlace),
        avoidFirstDay: isFullDayPlace(primaryPlace),
        avoidDepartureDay: isFullDayPlace(primaryPlace),
      },
      payload: { theme: primaryPlace, places: [primaryPlace] },
    })
  }

  if (wantsAdd && primaryPlace) {
    return createTask(trimmed, {
      taskType: 'add_must_go_place',
      confidence: 0.88,
      userIntentSummary: `用户想把${primaryPlace}加入行程`,
      target: { day, place: primaryPlace, timeSlot },
      constraints: {
        needsFullDay: isFullDayPlace(primaryPlace),
        avoidFirstDay: isFullDayPlace(primaryPlace),
        avoidDepartureDay: isFullDayPlace(primaryPlace),
        reason: isFullDayPlace(primaryPlace) ? `${primaryPlace}通常需要单独安排一整天` : undefined,
      },
      payload: { theme: primaryPlace, places: [primaryPlace] },
    })
  }

  if (wantsFood) {
    return createTask(trimmed, {
      taskType: 'add_food_request',
      confidence: 0.8,
      userIntentSummary: '用户希望增加餐饮或咖啡安排',
      target: { day, timeSlot },
      payload: { category: /咖啡|下午茶/.test(trimmed) ? 'cafe' : 'restaurant' },
    })
  }

  if (wantsRelax) {
    return createTask(trimmed, {
      taskType: 'adjust_pace',
      confidence: 0.8,
      userIntentSummary: '用户希望降低行程强度',
      target: { day },
      constraints: { pace: 'relaxed' },
    })
  }

  if (places.length > 0) {
    return createTask(trimmed, {
      taskType: 'add_must_go_place',
      confidence: 0.72,
      userIntentSummary: `用户提到了${places[0]}，倾向于加入行程`,
      target: { day, place: places[0] },
      constraints: { needsFullDay: isFullDayPlace(places[0]) },
      payload: { theme: places[0], places: [places[0]] },
    })
  }

  return createTask(trimmed, {
    taskType: trimmed ? 'record' : 'clarify',
    confidence: 0.55,
    needsClarification: !trimmed,
    userIntentSummary: trimmed || '用户输入为空',
    payload: { note: trimmed },
  })
}

export function normalizeTravelTaskFrame(task: TravelTaskFrameV2, tripState: TripState): TravelTaskFrameV2 {
  const place = task.target.place || task.payload.places?.[0]
  const needsFullDay = task.constraints.needsFullDay || isFullDayPlace(place)
  const target = { ...task.target }

  if ((task.taskType === 'add_must_go_place' || task.taskType === 'replace_day') && place && !target.day) {
    target.day = chooseBestDayForTask(tripState, needsFullDay)
  }

  return {
    ...task,
    confidence: clampConfidence(task.confidence),
    target,
    constraints: {
      ...task.constraints,
      needsFullDay,
      avoidFirstDay: task.constraints.avoidFirstDay || needsFullDay || Boolean(tripState.transportInfo.arrival),
      avoidDepartureDay: task.constraints.avoidDepartureDay || needsFullDay || Boolean(tripState.transportInfo.departure),
    },
    payload: {
      ...task.payload,
      ...(place && !task.payload.places?.length ? { places: [place] } : {}),
      ...(place && !task.payload.theme ? { theme: place } : {}),
    },
  }
}

function chooseBestDayForTask(tripState: TripState, needsFullDay = false) {
  const earliest = tripState.transportInfo.arrival ? 2 : 1
  const latest = tripState.transportInfo.departure ? Math.max(earliest, tripState.days - 1) : tripState.days
  const candidates = tripState.itinerary.filter(plan => plan.day >= earliest && plan.day <= latest && !plan.locked)
  const flexible = candidates.find(plan => /弹性|收尾|补充|自由|轻松/.test(`${plan.title}${plan.theme}${plan.reason}`))
  if (flexible) return flexible.day
  if (needsFullDay) return candidates.at(-1)?.day || earliest
  return candidates[0]?.day || earliest
}

export function validateTravelTaskFrame(task: TravelTaskFrameV2) {
  if (task.needsClarification || task.taskType === 'clarify') return { ok: true }
  if ((task.taskType === 'add_must_go_place' || task.taskType === 'remove_place' || task.taskType === 'replace_day') && !task.target.place && !task.payload.theme) {
    return { ok: false, reason: '缺少目标地点' }
  }
  return { ok: true }
}
