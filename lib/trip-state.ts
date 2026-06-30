import type {
  ActivityCategory,
  AIResult,
  CommandTimeSlot,
  DayIntensity,
  DayPlan,
  ItineraryItem,
  LocationConstraint,
  ParseResult,
  PatchValidationResult,
  Place,
  TimeIntent,
  TimeSlot,
  TravelEditCommand,
  TravelTaskFrame,
  TripPatch,
  TripSession,
  TripState,
} from './types'

interface SurfaceHints {
  days: number[]
  timeIntents: TimeIntent[]
  actionHints: string[]
  activityCategories: ActivityCategory[]
  placeMentions: string[]
  locationConstraint?: LocationConstraint
  negativeSignals: string[]
  budgetAmount?: number
  budgetSignals: string[]
  hasExecutableSignal: boolean
  structuredSignalCount: number
}

const chineseNumberMap: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

const timeIntentToPeriod: Record<TimeIntent, TimeSlot['period']> = {
  breakfast: '上午',
  morning: '上午',
  lunch: '下午',
  noon: '下午',
  afternoon: '下午',
  tea_time: '下午',
  dinner: '晚上',
  evening: '晚上',
  night: '晚上',
  late_night: '晚上',
}

const commandSlotToPeriod: Record<CommandTimeSlot, TimeSlot['period']> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
}

const budgetBreakdownCategories = ['交通', '餐饮', '门票', '住宿', '购物', '备用金']
const knownPlaceAliases = [
  '浅草',
  '上野',
  '原宿',
  '新宿',
  '涩谷',
  '银座',
  '筑地',
  '表参道',
  '台场',
  '代官山',
  '清澄白河',
  '太古里',
  '春熙路',
  '宽窄巷子',
  '人民公园',
  '迪士尼',
  '酒店',
]

const replacementPlaces: Record<string, Place> = {
  东京: { id: 'kiyosumi-shirakawa-replacement', name: '清澄白河', type: 'attraction', x: 62, y: 58 },
  成都: { id: 'people-park-replacement', name: '人民公园', type: 'attraction', x: 50, y: 62 },
  大阪: { id: 'nakanoshima-replacement', name: '中之岛', type: 'attraction', x: 54, y: 46 },
  京都: { id: 'kamogawa-replacement', name: '鸭川', type: 'attraction', x: 48, y: 54 },
}

const disneyPlaces: Record<string, Place> = {
  东京: { id: 'tokyo-disney-full-day', name: '东京迪士尼', type: 'attraction', x: 88, y: 55 },
  大阪: { id: 'universal-studios-japan-full-day', name: '大阪环球影城', type: 'attraction', x: 85, y: 52 },
}

function getHotelState(session: TripSession): TripState['hotel'] {
  const stayInfo = session.clarificationDetails.stayInfo
  return {
    area: stayInfo?.stayArea?.value || session.clarificationDetails.lodgingArea,
    name: stayInfo?.hotelName?.value,
    address: stayInfo?.hotelAddress?.value || session.clarificationDetails.hotelAddress,
  }
}

function getTransportInfo(session: TripSession): TripState['transportInfo'] {
  return {
    ...(session.clarificationDetails.arrivalInfo ? { arrival: session.clarificationDetails.arrivalInfo } : {}),
    ...(session.clarificationDetails.departureInfo ? { departure: session.clarificationDetails.departureInfo } : {}),
  }
}

export function createTripStateFromSession(session: TripSession): TripState {
  return {
    destination: session.destination,
    days: session.days,
    pace: session.pace,
    hotel: getHotelState(session),
    transportInfo: getTransportInfo(session),
    constraints: {
      avoidPlaces: [],
      avoidCategories: [],
      notes: session.constraints,
    },
    preferences: session.interests,
    budget: {
      mode: 'summary',
      categories: [],
    },
    candidatePlaces: session.candidatePlaces,
    planningConstraints: session.planningConstraints,
    itinerary: session.plans.map(plan => ({
      ...plan,
      items: plan.items || createItemsFromPlan(plan),
    })),
  }
}

function createItemsFromPlan(plan: DayPlan): ItineraryItem[] {
  return plan.slots.flatMap(slot => slot.activities.map((activity, index) => ({
    id: `day-${plan.day}-${slot.period}-${index}`.replace(/\s+/g, '-'),
    timeLabel: slot.period,
    timeIntent: periodToDefaultTimeIntent(slot.period),
    type: inferItemType(activity),
    title: activity,
    status: 'planned' as const,
    source: 'initial_ai_plan' as const,
  })))
}

function periodToDefaultTimeIntent(period: TimeSlot['period']): TimeIntent {
  if (period === '上午') return 'morning'
  if (period === '下午') return 'afternoon'
  if (period === '晚上') return 'evening'
  return 'morning'
}

function inferItemType(text: string): ItineraryItem['type'] {
  if (/餐|吃|饭|美食|小吃/.test(text)) return 'restaurant'
  if (/咖啡|下午茶/.test(text)) return 'cafe'
  if (/休息|自由/.test(text)) return 'free_time'
  if (/购物|商场|百货/.test(text)) return 'shopping'
  if (/酒店|住宿/.test(text)) return 'hotel'
  if (/交通|前往|返回|抵达/.test(text)) return 'transport'
  return 'sightseeing'
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function parseChineseNumber(value: string) {
  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (chineseNumberMap[value[1]] || 0)
  if (value.endsWith('十')) return (chineseNumberMap[value[0]] || 1) * 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (chineseNumberMap[tens] || 1) * 10 + (chineseNumberMap[ones] || 0)
  }
  return chineseNumberMap[value] || 0
}

function extractDays(input: string) {
  const days = new Set<number>()
  for (const match of input.matchAll(/(?:day\s*)?(\d{1,2})|第\s*([一二两三四五六七八九十]{1,3})\s*天/gi)) {
    const day = Number(match[1]) || parseChineseNumber(match[2] || '')
    if (day > 0) days.add(day)
  }
  return Array.from(days)
}

function extractAmount(input: string) {
  const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(w|万|元|块)?/i)
  if (amountMatch) {
    const amount = Number(amountMatch[1])
    if (!Number.isFinite(amount)) return undefined
    return /w|万/i.test(amountMatch[2] || '') ? amount * 10000 : amount
  }
  if (/一万/.test(input)) return 10000
  return undefined
}

function getKnownPlaces(state: TripState) {
  const itineraryPlaces = state.itinerary.flatMap(plan => plan.places.map(place => place.name))
  return uniqueValues([...knownPlaceAliases, ...itineraryPlaces])
}

function extractPlaceMentions(input: string, state: TripState) {
  return getKnownPlaces(state).filter(place => input.includes(place))
}

function extractTimeIntents(input: string): TimeIntent[] {
  return uniqueValues([
    /早餐|早饭/.test(input) ? 'breakfast' : '',
    /早上|上午/.test(input) ? 'morning' : '',
    /午餐|中午|午饭/.test(input) ? 'lunch' : '',
    /下午茶/.test(input) ? 'tea_time' : '',
    /下午/.test(input) ? 'afternoon' : '',
    /晚餐|晚饭|晚上吃饭/.test(input) ? 'dinner' : '',
    /晚上|夜间|晚间/.test(input) ? 'evening' : '',
    /夜宵/.test(input) ? 'late_night' : '',
  ]) as TimeIntent[]
}

function extractActivityCategories(input: string): ActivityCategory[] {
  return uniqueValues([
    /景点|游览|参观|寺|神社|博物馆/.test(input) ? 'sightseeing' : '',
    /餐厅|吃饭|午餐|晚餐|美食|饭/.test(input) ? 'restaurant' : '',
    /咖啡|咖啡店|下午茶/.test(input) ? 'cafe' : '',
    /购物|商场|买/.test(input) ? 'shopping' : '',
    /交通|地铁|打车|通勤/.test(input) ? 'transport' : '',
    /酒店|住宿/.test(input) ? 'hotel' : '',
    /休息|歇|放松/.test(input) ? 'rest' : '',
    /预算|花费|费用|价格|门票/.test(input) ? 'budget' : '',
  ]) as ActivityCategory[]
}

function extractLocationConstraint(input: string, places: string[]): LocationConstraint | undefined {
  if (/酒店附近|住宿附近/.test(input)) return { type: 'near_hotel', radiusLevel: 'nearby' }
  if (/不要绕远|别绕路|少绕路|别离.+太远|不要离.+太远|离.+太远/.test(input)) return { type: 'minimal_detour', radiusLevel: 'same_area' }
  if (/顺路|路上|途中/.test(input)) return { type: 'on_route', radiusLevel: 'nearby' }
  if (/同一区域|同一片|附近/.test(input)) {
    const anchorPlace = places.find(place => place !== '酒店')
    return { type: anchorPlace ? 'near' : 'same_area', anchorPlace, radiusLevel: 'nearby' }
  }
  return undefined
}

function getActionHints(input: string) {
  return uniqueValues([
    /增加|新增|添加|加一个|加一些|想加|多安排|补充|加入|加到|放进|放入|想去|还想去/.test(input) ? 'add' : '',
    /推荐|找个|找一家|安排/.test(input) ? 'recommend' : '',
    /不要|不去|不安排|取消|删除|删掉|避开|不感兴趣/.test(input) ? 'remove_or_avoid' : '',
    /换成|改成|替换|换掉|换一个|换个|换其他/.test(input) ? 'replace' : '',
    /重新规划|重新安排|重做/.test(input) ? 'regenerate' : '',
    /轻松|别太赶|慢一点|休息/.test(input) ? 'adjust' : '',
    /移动到|挪到|放到/.test(input) ? 'move' : '',
  ])
}

function isStandaloneDayPlace(place: string) {
  return /迪士尼|环球影城|环球|富士山|箱根/.test(place)
}

function inferBestDayForNewPlace(state: TripState, place: string) {
  const latestUsableDay = state.transportInfo.departure ? Math.max(2, state.days - 1) : state.days
  const candidates = state.itinerary.filter(plan => plan.day >= 2 && plan.day <= latestUsableDay && !plan.locked)
  const flexible = candidates.find(plan => /弹性|收尾|补充|自由|轻松/.test(`${plan.title}${plan.theme}${plan.reason}`))
  if (flexible) return flexible.day
  if (isStandaloneDayPlace(place)) return candidates.at(-1)?.day || Math.min(state.days, 2)
  return candidates[0]?.day || 1
}

export function extractSurfaceHints(input: string, tripState: TripState): SurfaceHints {
  const placeMentions = extractPlaceMentions(input, tripState)
  const actionHints = getActionHints(input)
  const activityCategories = extractActivityCategories(input)
  const timeIntents = extractTimeIntents(input)
  const budgetSignals = /预算|花费|费用|价格|多少钱|钱/.test(input) ? ['budget'] : []
  const negativeSignals = uniqueValues([
    /不想去|不去|不感兴趣|不喜欢|不考虑|避开/.test(input) ? 'avoid' : '',
    /不要再推荐|不要太|不想再/.test(input) ? 'avoid_category' : '',
  ])
  const locationConstraint = extractLocationConstraint(input, placeMentions)
  const structuredSignalCount = [
    extractDays(input).length > 0,
    timeIntents.length > 0,
    activityCategories.length > 0,
    placeMentions.length > 0,
    Boolean(locationConstraint),
    actionHints.length > 0,
    budgetSignals.length > 0,
  ].filter(Boolean).length

  return {
    days: extractDays(input),
    timeIntents,
    actionHints,
    activityCategories,
    placeMentions,
    locationConstraint,
    negativeSignals,
    budgetAmount: extractAmount(input),
    budgetSignals,
    hasExecutableSignal: actionHints.length > 0,
    structuredSignalCount,
  }
}

export const extractHints = extractSurfaceHints

function buildFrame(frame: Omit<TravelTaskFrame, 'confidence' | 'needsClarification' | 'rawUserInput'> & {
  confidence?: number
  needsClarification?: boolean
  rawUserInput: string
}): TravelTaskFrame {
  return {
    ...frame,
    confidence: frame.confidence ?? 0.86,
    needsClarification: frame.needsClarification ?? false,
  }
}

function getAvoidPlaces(hints: SurfaceHints) {
  return hints.placeMentions.filter(place => place !== '迪士尼' && place !== '酒店')
}

function getAvoidCategories(hints: SurfaceHints, input: string) {
  return uniqueValues([
    /寺庙|寺|神社/.test(input) ? '寺庙' : '',
    /商业|商场/.test(input) ? '商业/商场' : '',
    ...hints.activityCategories.filter(category => hints.negativeSignals.length > 0 && category !== 'restaurant').map(categoryLabel),
  ])
}

function getReplacementPreferenceCategories(input: string) {
  return uniqueValues([
    /街区|社区|city\s*walk|citywalk/i.test(input) ? '城市街区' : '',
    /咖啡|咖啡店|下午茶/.test(input) ? '咖啡店' : '',
    /餐厅|美食|吃饭|吃/.test(input) ? '餐厅' : '',
    /购物|商店|买/.test(input) ? '购物' : '',
  ])
}

function categoryLabel(category: ActivityCategory) {
  const labels: Record<ActivityCategory, string> = {
    sightseeing: '景点',
    restaurant: '餐厅',
    cafe: '咖啡店',
    shopping: '购物',
    transport: '交通',
    hotel: '酒店',
    rest: '休息',
    experience: '体验',
    free_time: '自由活动',
    nightlife: '夜生活',
    budget: '预算',
    reservation: '预约',
    unknown: '未知',
  }
  return labels[category]
}

function primaryActivityCategory(hints: SurfaceHints): ActivityCategory | undefined {
  if (hints.activityCategories.includes('restaurant')) return 'restaurant'
  if (hints.activityCategories.includes('cafe')) return 'cafe'
  if (hints.activityCategories.includes('rest')) return 'rest'
  if (hints.activityCategories.includes('shopping')) return 'shopping'
  return hints.activityCategories[0]
}

function inferRecommendationMode(hints: SurfaceHints): NonNullable<NonNullable<TravelTaskFrame['activity']>['recommendationMode']> {
  if (hints.locationConstraint?.type === 'near' || hints.locationConstraint?.type === 'near_hotel') return 'nearby_options'
  if (hints.locationConstraint?.type === 'on_route' || hints.locationConstraint?.type === 'minimal_detour') return 'route_based'
  return 'category_placeholder'
}

export function semanticFrameParser(input: string, tripState: TripState, hints = extractSurfaceHints(input, tripState)): TravelTaskFrame[] {
  const day = hints.days[0]
  const frames: TravelTaskFrame[] = []
  const category = primaryActivityCategory(hints)
  const avoidPlaces = getAvoidPlaces(hints)
  const avoidCategories = getAvoidCategories(hints, input)
  const replacementPreferenceCategories = hints.negativeSignals.length > 0 && /换成|改成|替换|多加|增加/.test(input)
    ? getReplacementPreferenceCategories(input)
    : []
  const isVague = /怪怪的|不太对|不合适|有点怪|不像我想要/.test(input)

  if (isVague) {
    return [buildFrame({
      taskType: 'clarify',
      operation: 'clarify',
      scope: 'day',
      target: day ? { day } : undefined,
      clarificationQuestion: '你是觉得这天太满、地点不感兴趣，还是路线不顺？我可以按你的方向重新调整。',
      confidence: 0.68,
      needsClarification: true,
      rawUserInput: input,
    })]
  }

  if (hints.budgetSignals.length > 0) {
    frames.push(buildFrame({
      taskType: 'update_budget',
      operation: 'update',
      scope: 'budget',
      constraints: {
        budgetConstraint: {
          mode: /细节|拆分|明细|每天|算进去|控制/.test(input) ? 'category_breakdown' : 'total',
          amount: hints.budgetAmount,
          categories: /吃饭|餐饮/.test(input) ? ['餐饮'] : /交通/.test(input) ? ['交通'] : budgetBreakdownCategories,
        },
      },
      confidence: 0.88,
      rawUserInput: input,
    }))
  }

  if (hints.negativeSignals.length > 0 && (avoidPlaces.length > 0 || avoidCategories.length > 0)) {
    frames.push(buildFrame({
      taskType: 'add_constraint',
      operation: 'add',
      scope: 'constraint',
      target: day ? { day } : undefined,
      constraints: {
        avoidPlaces,
        avoidCategories,
      },
      confidence: 0.88,
      rawUserInput: input,
    }))
  }

  if (replacementPreferenceCategories.length > 0) {
    frames.push(buildFrame({
      taskType: 'add_recommendation',
      operation: 'add',
      scope: 'preference',
      constraints: {
        preferCategories: replacementPreferenceCategories,
      },
      confidence: 0.82,
      rawUserInput: input,
    }))
  }

  if (day && hints.actionHints.includes('replace') && avoidPlaces.length > 0) {
    frames.push(buildFrame({
      taskType: 'replace_activity',
      operation: 'replace',
      scope: 'place',
      target: { day, place: avoidPlaces[0] },
      constraints: {
        avoidPlaces,
      },
      confidence: 0.88,
      rawUserInput: input,
    }))
  }

  if (hints.negativeSignals.length === 0 && (hints.actionHints.includes('add') || hints.actionHints.includes('recommend')) && category && category !== 'budget') {
    frames.push(buildFrame({
      taskType: category === 'restaurant' || category === 'cafe' ? 'add_recommendation' : 'add_activity',
      operation: hints.actionHints.includes('recommend') ? 'recommend' : 'add',
      scope: 'activity',
      target: {
        ...(day ? { day } : {}),
        timeSlots: hints.timeIntents,
      },
      activity: {
        category,
        anchorPlace: hints.placeMentions.find(place => place !== '酒店'),
        recommendationMode: inferRecommendationMode(hints),
      },
      constraints: {
        locationConstraint: hints.locationConstraint,
        routePreference: hints.locationConstraint?.type === 'minimal_detour'
          ? 'minimal_detour'
          : hints.locationConstraint?.type === 'on_route'
            ? 'on_route'
            : undefined,
      },
      confidence: day || hints.timeIntents.length > 0 ? 0.86 : 0.74,
      rawUserInput: input,
    }))
  }

  const positivePlaceAddIntent = hints.negativeSignals.length === 0 &&
    hints.actionHints.includes('add') &&
    hints.placeMentions.some(place => place !== '酒店')
  const addedPlace = hints.placeMentions.find(place => place !== '酒店')

  if (!day && positivePlaceAddIntent && addedPlace) {
    const targetDay = inferBestDayForNewPlace(tripState, addedPlace)
    if (isStandaloneDayPlace(addedPlace)) {
      frames.push(buildFrame({
        taskType: 'replace_activity',
        operation: 'replace',
        scope: 'day',
        target: { day: targetDay },
        activity: {
          category: 'experience',
          theme: addedPlace,
          anchorPlace: addedPlace === '迪士尼' ? `${tripState.destination}迪士尼度假区` : addedPlace,
        },
        confidence: 0.88,
        rawUserInput: input,
      }))
    } else {
      frames.push(buildFrame({
        taskType: 'add_activity',
        operation: 'add',
        scope: 'place',
        target: { day: targetDay, place: addedPlace },
        activity: {
          category: 'experience',
          anchorPlace: addedPlace,
        },
        confidence: 0.84,
        rawUserInput: input,
      }))
    }
  }

  if (day && hints.placeMentions.includes('迪士尼') && /去|安排|改成|换成|全天|加入|新增|添加|想去|还想去/.test(input)) {
    frames.push(buildFrame({
      taskType: 'replace_activity',
      operation: 'replace',
      scope: 'day',
      target: { day },
      activity: {
        category: 'experience',
        theme: '迪士尼',
        anchorPlace: `${tripState.destination}迪士尼度假区`,
      },
      constraints: {
        avoidPlaces,
      },
      confidence: 0.9,
      rawUserInput: input,
    }))
  } else if (day && avoidPlaces.length === 0 && hints.actionHints.includes('replace') && category && category !== 'budget') {
    const theme = categoryLabel(category)
    frames.push(buildFrame({
      taskType: 'replace_activity',
      operation: 'replace',
      scope: 'day',
      target: { day },
      activity: { category, theme },
      confidence: 0.82,
      rawUserInput: input,
    }))
  } else if (day && avoidPlaces.length === 0 && hints.actionHints.includes('replace') && hints.placeMentions.length > 0) {
    const theme = hints.placeMentions[0]
    frames.push(buildFrame({
      taskType: 'replace_activity',
      operation: 'replace',
      scope: 'day',
      target: { day },
      activity: { category: 'experience', theme, anchorPlace: theme },
      confidence: 0.82,
      rawUserInput: input,
    }))
  }

  if (day && hints.actionHints.includes('regenerate')) {
    frames.push(buildFrame({
      taskType: 'modify_itinerary',
      operation: 'regenerate',
      scope: 'day',
      target: { day },
      constraints: {
        avoidPlaces,
      },
      confidence: 0.86,
      rawUserInput: input,
    }))
  }

  if (hints.actionHints.includes('adjust') || hints.locationConstraint?.type === 'minimal_detour' || hints.locationConstraint?.type === 'on_route' || /别太赶|轻松|休息时间|不要绕远|尽量顺路/.test(input)) {
    frames.push(buildFrame({
      taskType: 'adjust_pace',
      operation: 'adjust',
      scope: day ? 'day' : hints.locationConstraint ? 'route' : 'trip',
      target: day ? { day } : undefined,
      activity: /休息/.test(input) ? { category: 'rest', recommendationMode: 'category_placeholder' } : undefined,
      constraints: {
        pace: /轻松|别太赶|休息/.test(input) ? 'relaxed' : undefined,
        locationConstraint: hints.locationConstraint,
        routePreference: hints.locationConstraint?.type === 'minimal_detour'
          ? 'minimal_detour'
          : hints.locationConstraint?.type === 'on_route'
            ? 'on_route'
            : undefined,
      },
      confidence: 0.78,
      rawUserInput: input,
    }))
  }

  if (hints.actionHints.includes('move')) {
    const place = hints.placeMentions.find(item => item !== '酒店')
    frames.push(buildFrame({
      taskType: place && day ? 'move_activity' : 'clarify',
      operation: place && day ? 'move' : 'clarify',
      scope: 'place',
      target: { ...(day ? { day } : {}), ...(place ? { place } : {}) },
      confidence: place && day ? 0.86 : 0.55,
      needsClarification: !(place && day),
      clarificationQuestion: '需要确认要移动的地点和目标日期。',
      rawUserInput: input,
    }))
  }

  if (frames.length === 0) {
    if (hints.hasExecutableSignal || hints.structuredSignalCount >= 2) {
      return [buildFrame({
        taskType: 'clarify',
        operation: 'clarify',
        scope: day ? 'day' : 'trip',
        target: day ? { day } : undefined,
        clarificationQuestion: '我需要确认一下：你想新增、替换、删除，还是调整这段行程？',
        confidence: 0.52,
        needsClarification: true,
        rawUserInput: input,
      })]
    }

    return [buildFrame({
      taskType: 'record',
      operation: 'record',
      scope: 'note',
      confidence: 0.62,
      rawUserInput: input,
    })]
  }

  return normalizeTravelTaskFrames(frames, tripState)
}

export function normalizeTravelTaskFrames(frames: TravelTaskFrame[], tripState: TripState): TravelTaskFrame[] {
  const defaultDay = tripState.itinerary[0]?.day || 1
  return frames.map(frame => {
    const activity = frame.activity
    const normalizedAnchor = activity?.anchorPlace === '迪士尼' ? `${tripState.destination}迪士尼度假区` : activity?.anchorPlace
    const normalizedLocation = frame.constraints?.locationConstraint
    const normalizedTarget = (frame.scope === 'activity' && !frame.target?.day && (frame.operation === 'add' || frame.operation === 'recommend'))
      ? { ...frame.target, day: defaultDay }
      : frame.target
    return {
      ...frame,
      target: normalizedTarget,
      activity: activity
        ? {
            ...activity,
            anchorPlace: normalizedAnchor,
          }
        : activity,
      constraints: frame.constraints
        ? {
            ...frame.constraints,
            locationConstraint: normalizedLocation?.type === 'near' && !normalizedLocation.anchorPlace && normalizedAnchor
              ? { ...normalizedLocation, anchorPlace: normalizedAnchor }
              : normalizedLocation,
          }
        : frame.constraints,
    }
  })
}

function commandFromFrame(frame: TravelTaskFrame): TravelEditCommand {
  return {
    operation: frame.operation,
    scope: frame.scope === 'route' ? 'map_route' : frame.scope,
    target: frame.target
      ? {
          day: frame.target.day,
          timeSlots: frame.target.timeSlots,
          place: frame.target.place,
          activityId: frame.target.activityId,
        }
      : undefined,
    payload: {
      activityCategory: frame.activity?.category,
      timeIntents: frame.target?.timeSlots,
      places: frame.activity?.anchorPlace ? [frame.activity.anchorPlace] : undefined,
      avoidPlaces: frame.constraints?.avoidPlaces,
      preferPlaces: frame.constraints?.preferPlaces,
      categories: frame.scope === 'constraint'
        ? frame.constraints?.avoidCategories || frame.constraints?.preferCategories
        : frame.activity?.category
          ? [categoryLabel(frame.activity.category)]
          : frame.constraints?.preferCategories,
      theme: frame.activity?.theme,
      anchorPlace: frame.activity?.anchorPlace,
      locationConstraint: frame.constraints?.locationConstraint,
      duration: /全天/.test(frame.rawUserInput) ? 'full_day' : /半天/.test(frame.rawUserInput) ? 'half_day' : undefined,
      pace: frame.constraints?.pace,
      budgetMode: frame.constraints?.budgetConstraint?.mode === 'category_breakdown' ? 'breakdown' : undefined,
      budgetCategories: frame.constraints?.budgetConstraint?.categories,
      recommendationMode: frame.activity?.recommendationMode,
      overwrite: frame.operation === 'replace' && frame.scope === 'day',
      respectConstraints: Boolean(frame.constraints?.avoidPlaces?.length || frame.constraints?.locationConstraint),
      note: frame.clarificationQuestion || frame.rawUserInput,
      reason: frame.constraints?.budgetConstraint ? '用户希望调整预算展示' : undefined,
    },
    confidence: frame.confidence,
    needsClarification: frame.needsClarification,
  }
}

export function framesToCommands(frames: TravelTaskFrame[]): TravelEditCommand[] {
  return frames.map(commandFromFrame)
}

function getOverallActionMode(commands: TravelEditCommand[]): ParseResult['actionMode'] {
  if (commands.some(command => command.operation === 'unsupported')) return 'unsupported'
  if (commands.some(command => command.operation === 'clarify' || command.needsClarification)) return 'clarify'
  if (commands.every(command => command.operation === 'record')) return 'record'
  if (commands.some(command => command.confidence < 0.72)) return 'confirm'
  return 'execute'
}

export function semanticParseUserFeedback(input: string, tripState: TripState, hints = extractSurfaceHints(input, tripState)): ParseResult {
  const frames = semanticFrameParser(input, tripState, hints)
  const commands = framesToCommands(frames)
  return {
    commands,
    confidence: commands.reduce((sum, command) => sum + command.confidence, 0) / commands.length,
    actionMode: getOverallActionMode(commands),
    userFacingMessage: frames.find(frame => frame.needsClarification)?.clarificationQuestion,
  }
}

function createPatch(operation: TripPatch['operation'], command: TravelEditCommand, payload?: Record<string, unknown>): TripPatch {
  return {
    operation,
    target: command.target
      ? {
          day: command.target.day,
          place: command.target.place,
          timeSlot: command.target.timeSlots?.[0] ? timeIntentToPeriod[command.target.timeSlots[0]] : command.target.timeSlot ? commandSlotToPeriod[command.target.timeSlot] : undefined,
        }
      : undefined,
    payload: {
      ...command.payload,
      ...payload,
    },
  }
}

export function commandsToPatches(commands: TravelEditCommand[], tripState: TripState): TripPatch[] {
  return commands.map(command => {
    if (command.operation === 'add' && command.scope === 'constraint') return createPatch('add_constraint', command)
    if (command.operation === 'regenerate' && command.scope === 'day') {
      return createPatch('replace_day', command, {
        dayPlan: command.target?.day ? createRegeneratedDayPlan(tripState, command.target.day, command.payload?.avoidPlaces || []) : undefined,
      })
    }
    if (command.operation === 'replace' && command.scope === 'day') {
      return createPatch('replace_day', command, {
        dayPlan: command.target?.day ? createFullDayPlan(tripState, command.target.day, command.payload?.theme || '新的全天行程') : undefined,
      })
    }
    if ((command.operation === 'add' || command.operation === 'recommend') && command.scope === 'activity') return createPatch('add_activity', command)
    if (command.operation === 'add' && command.scope === 'place') return createPatch('add_place', command)
    if (command.operation === 'adjust' && command.scope === 'day') return createPatch('adjust_day_pace', command, { pace: command.payload?.pace || 'relaxed' })
    if (command.operation === 'adjust' && command.scope === 'map_route') return createPatch('adjust_route', command)
    if (command.operation === 'remove' && command.scope === 'time_slot') return createPatch('remove_time_slot', command)
    if (command.operation === 'add' && command.scope === 'preference') return createPatch('update_preference', command)
    if (command.operation === 'replace' && command.scope === 'place') return createPatch('replace_place', command)
    if (command.operation === 'remove' && command.scope === 'place') return createPatch('remove_place', command)
    if (command.operation === 'move' && command.scope === 'place') return createPatch('move_place', command)
    if (command.operation === 'update' && command.scope === 'budget') return createPatch('update_budget', command)
    if (command.operation === 'record') return createPatch('record_note', command)
    return createPatch('record_note', command)
  })
}

function getPlanByDay(state: TripState, day?: number) {
  return state.itinerary.find(plan => plan.day === day)
}

function removePlaceFromSlots(slots: TimeSlot[], placeName: string) {
  return slots.map(slot => ({
    ...slot,
    activities: slot.activities.filter(activity => !activity.includes(placeName)),
  })).filter(slot => slot.activities.length > 0)
}

function addRelaxedActivity(slots: TimeSlot[], placeName: string) {
  const hasAfternoon = slots.some(slot => slot.period === '下午')
  if (!hasAfternoon) return [...slots, { period: '下午' as const, activities: [`改为${placeName}轻松漫步`, '保留咖啡或休息时间'] }]
  return slots.map(slot => (slot.period === '下午' ? { ...slot, activities: [...slot.activities, `改为${placeName}轻松漫步`, '保留咖啡或休息时间'] } : slot))
}

function sanitizeTitle(title: string, removePlace: string, fallback: string) {
  const cleaned = title
    .replace(new RegExp(removePlace, 'g'), '')
    .replace(/\s*\+\s*\+\s*/g, ' + ')
    .replace(/^\s*\+\s*|\s*\+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || fallback
}

function createFallbackPlace(state: TripState, day: number, avoidPlace?: string): Place {
  const preset = replacementPlaces[state.destination] || {
    id: `${state.destination}-relaxed-replacement-${day}`.replace(/\s+/g, '-').toLowerCase(),
    name: `${state.destination}轻松街区`,
    type: 'attraction' as const,
    x: 50,
    y: 58,
  }
  if (!avoidPlace || preset.name !== avoidPlace) return preset
  return { ...preset, id: `${preset.id}-alt`, name: `${state.destination}轻松街区` }
}

function replacePlaceInDay(state: TripState, plan: DayPlan, removePlace: string) {
  const replacement = createFallbackPlace(state, plan.day, removePlace)
  const places = plan.places.filter(place => !place.name.includes(removePlace))
  const cleanedItems = (plan.items || createItemsFromPlan(plan)).filter(item => !item.title.includes(removePlace) && !item.place?.includes(removePlace))
  const replacementItem: ItineraryItem = {
    id: `day-${plan.day}-${replacement.id}`,
    timeLabel: '下午',
    timeIntent: 'afternoon',
    type: 'sightseeing',
    title: `改为${replacement.name}轻松漫步`,
    place: replacement.name,
    status: 'planned',
    source: 'ai_generated',
  }
  return {
    ...plan,
    title: sanitizeTitle(plan.title, removePlace, replacement.name),
    theme: '轻松替换路线',
    intensity: '轻松' as const,
    slots: addRelaxedActivity(removePlaceFromSlots(plan.slots, removePlace), replacement.name),
    places: places.some(place => place.name === replacement.name) ? places : [...places, replacement],
    items: [
      ...cleanedItems,
      replacementItem,
    ],
    estimatedTransport: '约 25-40 分钟',
    reason: '已根据你的反馈改成更轻松、留有弹性的路线。',
  }
}

function removePlaceFromDay(plan: DayPlan, placeName: string) {
  return {
    ...plan,
    title: sanitizeTitle(plan.title, placeName, plan.title),
    slots: removePlaceFromSlots(plan.slots, placeName),
    places: plan.places.filter(place => !place.name.includes(placeName)),
    items: (plan.items || []).filter(item => !item.title.includes(placeName) && !item.place?.includes(placeName)),
    reason: '已根据你的反馈移除不想去的地点。',
  }
}

function textMatchesAvoidCategory(text: string | undefined, category: string) {
  if (!text) return false
  if (category === '寺庙') return /寺|神社|神宫|宫|庙|浅草寺|清水寺|伏见稻荷/.test(text)
  if (category === '商业/商场') return /商场|商业|购物中心|百货|银座/.test(text)
  return text.includes(category)
}

function placeMatchesAvoidCategory(place: Place, categories: string[]) {
  return categories.some(category => textMatchesAvoidCategory(place.name, category))
}

function itemMatchesAvoidCategory(item: ItineraryItem, categories: string[]) {
  return categories.some(category => textMatchesAvoidCategory(item.title, category) || textMatchesAvoidCategory(item.place, category))
}

function replaceAvoidedCategoriesInPlan(state: TripState, plan: DayPlan, categories: string[]) {
  if (categories.length === 0) return plan

  const removedPlaces = plan.places.filter(place => placeMatchesAvoidCategory(place, categories))
  const shouldUpdateBySlot = plan.slots.some(slot => slot.activities.some(activity => categories.some(category => textMatchesAvoidCategory(activity, category))))
  const shouldUpdateByItem = (plan.items || []).some(item => itemMatchesAvoidCategory(item, categories))
  if (removedPlaces.length === 0 && !shouldUpdateBySlot && !shouldUpdateByItem) return plan

  const replacement = createFallbackPlace(state, plan.day, removedPlaces[0]?.name)
  const cleanedPlaces = plan.places.filter(place => !placeMatchesAvoidCategory(place, categories))
  const cleanedItems = (plan.items || createItemsFromPlan(plan)).filter(item => !itemMatchesAvoidCategory(item, categories))
  const cleanedSlots = plan.slots
    .map(slot => ({
      ...slot,
      activities: slot.activities.filter(activity => !categories.some(category => textMatchesAvoidCategory(activity, category))),
    }))
    .filter(slot => slot.activities.length > 0)
  const replacementItem: ItineraryItem = {
    id: `day-${plan.day}-${replacement.id}-category-replacement`,
    timeLabel: '下午',
    timeIntent: 'afternoon',
    type: 'sightseeing',
    title: `${replacement.name}街区漫步`,
    place: replacement.name,
    status: 'planned',
    source: 'ai_generated',
  }
  const removedNames = removedPlaces.map(place => place.name)
  const nextTitle = removedNames.reduce(
    (title, placeName) => sanitizeTitle(title, placeName, replacement.name),
    plan.title,
  )

  return {
    ...plan,
    title: nextTitle,
    theme: '避开不感兴趣类型的轻松路线',
    intensity: '轻松' as const,
    slots: addRelaxedActivity(cleanedSlots, replacement.name),
    places: uniquePlaces([...cleanedPlaces, replacement]),
    items: cleanedItems.some(item => item.place === replacement.name) ? cleanedItems : [...cleanedItems, replacementItem],
    estimatedTransport: '约 20-35 分钟',
    reason: `已根据你的约束减少${joinChineseList(categories)}类安排，并换成更轻松的街区/休息路线。`,
  }
}

function createFullDayPlan(state: TripState, day: number, themeName: string): DayPlan {
  const isDisney = /迪士尼/.test(themeName)
  const isAnimeTheme = /二次元|动漫|动画|漫画|番剧|谷子|手办/.test(themeName)
  const isExplicitTheme = !/新的全天行程|重新规划/.test(themeName)
  if (isAnimeTheme) {
    const places = state.destination.includes('东京')
      ? [
          { id: `day-${day}-akihabara`, name: '秋叶原', type: 'shopping' as const, x: 58, y: 45 },
          { id: `day-${day}-ikebukuro`, name: '池袋', type: 'shopping' as const, x: 48, y: 36 },
          { id: `day-${day}-nakano`, name: '中野百老汇', type: 'shopping' as const, x: 38, y: 42 },
        ]
      : [
          { id: `day-${day}-anime-area`, name: `${state.destination}二次元街区`, type: 'shopping' as const, x: 50 + (day % 3) * 6, y: 48 + (day % 4) * 5 },
        ]
    return {
      day,
      title: '二次元主题日',
      theme: '动漫街区、周边店与轻松探索',
      intensity: '适中',
      slots: [
        { period: '上午', activities: [`${places[0].name}动漫/周边店集中逛`, '按兴趣筛选手办、谷子或中古店'] },
        { period: '下午', activities: [`前往${places[1]?.name || places[0].name}继续二次元街区探索`, '预留咖啡和购物休息时间'] },
        { period: '晚上', activities: ['根据体力决定是否补充夜间街区散步', '返回住宿区域休息'] },
      ],
      items: [
        {
          id: `day-${day}-anime-morning`,
          timeLabel: '上午',
          timeIntent: 'morning',
          type: 'shopping',
          title: `${places[0].name}二次元店铺探索`,
          place: places[0].name,
          status: 'planned',
          source: 'ai_generated',
        },
        {
          id: `day-${day}-anime-afternoon`,
          timeLabel: '下午',
          timeIntent: 'afternoon',
          type: 'shopping',
          title: `${places[1]?.name || places[0].name}周边补充`,
          place: places[1]?.name || places[0].name,
          status: 'planned',
          source: 'ai_generated',
        },
      ],
      reason: `已将 Day ${day} 改为二次元主题日，优先选择动漫/周边店集中的区域，并保留购物和休息弹性。`,
      places,
      estimatedTransport: '约 25-45 分钟',
    }
  }
  const place = isDisney
    ? disneyPlaces[state.destination] || { id: 'disney-full-day', name: '迪士尼', type: 'attraction' as const, x: 88, y: 55 }
    : isExplicitTheme
      ? {
          id: `day-${day}-${themeName}`.replace(/\s+/g, '-').toLowerCase(),
          name: themeName,
          type: /购物|商场|买/.test(themeName) ? 'shopping' as const : /餐厅|美食|咖啡/.test(themeName) ? 'food' as const : 'attraction' as const,
          x: 50 + (day % 3) * 6,
          y: 48 + (day % 4) * 5,
        }
      : createFallbackPlace(state, day)
  return {
    day,
    title: place.name,
    theme: `${place.name}全天安排`,
    intensity: '较满',
    slots: [
      { period: '全天', activities: [`${place.name}全天游玩`, '园区内用餐与休息', '根据体力安排重点项目'] },
      { period: '晚上', activities: ['返回住宿区域休息'] },
    ],
    items: [
      {
        id: `day-${day}-${place.id}`,
        timeLabel: '全天',
        timeIntent: 'morning',
        type: 'experience',
        title: `${place.name}全天游玩`,
        place: place.name,
        status: 'planned',
        source: 'ai_generated',
      },
    ],
    reason: `已将 Day ${day} 改为${place.name}主题的一整天安排，避免和其他跨区景点混排。`,
    places: [place],
    estimatedTransport: '约 60 分钟（往返）',
  }
}

function createRegeneratedDayPlan(state: TripState, day: number, avoidPlaces: string[]) {
  const current = getPlanByDay(state, day)
  const base = current || createFullDayPlan(state, day, '重新规划')
  const replacement = createFallbackPlace(state, day, avoidPlaces[0])
  const cleanedPlaces = base.places.filter(place => !avoidPlaces.some(avoid => place.name.includes(avoid)))
  const nextPlaces = cleanedPlaces.length > 0 ? cleanedPlaces : [replacement]
  return {
    ...base,
    title: `重新规划 Day ${day}`,
    theme: '避开不感兴趣地点的轻松路线',
    intensity: '轻松' as const,
    slots: [
      { period: '上午' as const, activities: [`${nextPlaces[0]?.name || replacement.name}轻松游览`, '保留弹性调整时间'] },
      { period: '下午' as const, activities: [`${replacement.name}周边漫步`, '咖啡或休息时间'] },
      { period: '晚上' as const, activities: ['自由活动或回住宿区域休息'] },
    ],
    items: createItemsFromPlan(base).filter(item => !avoidPlaces.some(avoid => item.title.includes(avoid))),
    places: uniquePlaces([...nextPlaces, replacement]).filter(place => !avoidPlaces.some(avoid => place.name.includes(avoid))),
    estimatedTransport: '约 25-40 分钟',
    reason: '已根据新的约束重新规划这一天，避开不感兴趣地点。',
  }
}

function uniquePlaces(places: Place[]) {
  const map = new Map<string, Place>()
  places.forEach(place => map.set(place.name, place))
  return Array.from(map.values())
}

function adjustDayPace(plan: DayPlan, pace: DayIntensity) {
  return {
    ...plan,
    intensity: pace,
    theme: pace === '轻松' ? `轻松版${plan.theme.replace(/^轻松版/, '')}` : plan.theme,
    slots: plan.slots.map(slot => ({ ...slot, activities: slot.activities.slice(0, pace === '轻松' ? 2 : 3) })),
    places: pace === '轻松' ? plan.places.slice(0, Math.max(1, Math.min(3, plan.places.length))) : plan.places,
    estimatedTransport: pace === '轻松' ? '约 20-35 分钟' : plan.estimatedTransport,
    reason: pace === '轻松' ? '已降低这一天的节奏，减少主要停留点并保留更多休息时间。' : plan.reason,
  }
}

function removeTimeSlotFromPlan(plan: DayPlan, period: TimeSlot['period']) {
  return {
    ...plan,
    slots: [...plan.slots.filter(slot => slot.period !== period), { period, activities: ['自由活动或休息'] }],
    items: (plan.items || []).filter(item => timeIntentToPeriod[item.timeIntent || 'evening'] !== period),
    reason: `已按你的反馈减少${period}安排，保留自由活动时间。`,
  }
}

function createPlaceholderItem(day: number, patch: TripPatch, timeIntent: TimeIntent): ItineraryItem {
  const category = (patch.payload?.activityCategory as ActivityCategory | undefined) || 'unknown'
  const anchorPlace = patch.payload?.anchorPlace as string | undefined
  const locationConstraint = patch.payload?.locationConstraint as LocationConstraint | undefined
  const label = categoryLabel(category)
  const timeLabel = timeIntentLabel(timeIntent)
  const title = anchorPlace
    ? `${anchorPlace}附近${timeLabel}${label}推荐`
    : `${timeLabel}${label}推荐`
  const type = category === 'restaurant' || category === 'cafe' || category === 'rest'
    ? category
    : category === 'unknown' || category === 'budget' || category === 'reservation'
      ? 'placeholder'
      : category
  return {
    id: `day-${day}-${timeIntent}-${category}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    timeLabel,
    timeIntent,
    type,
    title,
    place: anchorPlace,
    note: patch.payload?.recommendationMode === 'route_based' ? '按路线顺路推荐，待接入 POI API 后细化具体店铺。' : '待接入 POI API 后细化具体地点。',
    locationConstraint,
    status: 'needs_api',
    source: 'user_request',
  }
}

function addActivityToDay(plan: DayPlan, patch: TripPatch) {
  const timeIntents: TimeIntent[] = (patch.payload?.timeIntents as TimeIntent[] | undefined)?.length
    ? patch.payload?.timeIntents as TimeIntent[]
    : ['afternoon']
  const items = timeIntents.map(timeIntent => createPlaceholderItem(plan.day, patch, timeIntent))
  const nextSlots = [...plan.slots]
  items.forEach(item => {
    const itemTimeIntent: TimeIntent = item.timeIntent || 'afternoon'
    const period = timeIntentToPeriod[itemTimeIntent]
    const slot = nextSlots.find(current => current.period === period)
    if (slot) slot.activities = [...slot.activities, item.title]
    else nextSlots.push({ period, activities: [item.title] })
  })
  return {
    ...plan,
    slots: nextSlots,
    items: [...(plan.items || createItemsFromPlan(plan)), ...items],
    reason: '已根据你的请求加入新的旅行活动占位，后续可接入 API 细化具体地点。',
  }
}

function addPlaceToDay(state: TripState, plan: DayPlan, placeName: string) {
  const place: Place = {
    id: `${state.destination}-${placeName}-${plan.day}`.replace(/\s+/g, '-').toLowerCase(),
    name: placeName,
    type: /咖啡|餐厅|美食|饭/.test(placeName) ? 'food' : 'attraction',
    x: Math.min(88, 24 + plan.day * 8),
    y: Math.min(72, 42 + plan.day * 4),
  }
  return {
    ...plan,
    slots: addRelaxedActivity(plan.slots, place.name),
    places: uniquePlaces([...plan.places, place]),
    reason: `已根据你的偏好加入${place.name}，后续可继续细化停留时间。`,
  }
}

function movePlace(state: TripState, placeName: string, toDay?: number) {
  if (!toDay) return state
  const sourcePlan = state.itinerary.find(plan => plan.places.some(place => place.name.includes(placeName)))
  const place = sourcePlan?.places.find(item => item.name.includes(placeName))
  if (!sourcePlan || !place) return state
  return {
    ...state,
    itinerary: state.itinerary.map(plan => {
      if (plan.day === sourcePlan.day) return removePlaceFromDay(plan, placeName)
      if (plan.day === toDay) return addPlaceToDay(state, plan, place.name)
      return plan
    }),
  }
}

export function applyPatches(state: TripState, patches: TripPatch[]): TripState {
  return patches.reduce((current, patch) => {
    const day = patch.target?.day
    const place = patch.target?.place
    const timeSlot = patch.target?.timeSlot
    const avoidPlaces = (patch.payload?.avoidPlaces as string[] | undefined) || []
    const categories = (patch.payload?.categories as string[] | undefined) || []
    switch (patch.operation) {
      case 'add_constraint':
        return {
          ...current,
          constraints: {
            ...current.constraints,
            avoidPlaces: uniqueValues([...current.constraints.avoidPlaces, ...avoidPlaces, ...(place ? [place] : [])]),
            avoidCategories: uniqueValues([...current.constraints.avoidCategories, ...categories]),
          },
          itinerary: categories.length > 0
            ? current.itinerary.map(plan => replaceAvoidedCategoriesInPlan(current, plan, categories))
            : current.itinerary,
        }
      case 'replace_day':
        return { ...current, itinerary: current.itinerary.map(plan => (plan.day === day ? patch.payload?.dayPlan as DayPlan || plan : plan)) }
      case 'add_activity':
        return { ...current, itinerary: current.itinerary.map(plan => (plan.day === day ? addActivityToDay(plan, patch) : plan)) }
      case 'add_place':
        return place
          ? { ...current, itinerary: current.itinerary.map(plan => (plan.day === day ? addPlaceToDay(current, plan, place) : plan)) }
          : current
      case 'replace_place': {
        if (!day || !place) return current
        const plan = getPlanByDay(current, day)
        if (!plan) return current
        return {
          ...current,
          constraints: { ...current.constraints, avoidPlaces: uniqueValues([...current.constraints.avoidPlaces, place]) },
          itinerary: current.itinerary.map(item => (item.day === day ? replacePlaceInDay(current, plan, place) : item)),
        }
      }
      case 'remove_place':
        return {
          ...current,
          constraints: { ...current.constraints, avoidPlaces: uniqueValues([...current.constraints.avoidPlaces, ...(place ? [place] : [])]) },
          itinerary: current.itinerary.map(plan => (!day || plan.day === day) && place ? removePlaceFromDay(plan, place) : plan),
        }
      case 'move_place':
        return place ? movePlace(current, place, day) : current
      case 'adjust_day_pace':
        return { ...current, itinerary: current.itinerary.map(plan => (plan.day === day ? adjustDayPace(plan, patch.payload?.pace === 'relaxed' ? '轻松' : '适中') : plan)) }
      case 'adjust_route':
        return {
          ...current,
          constraints: {
            ...current.constraints,
            notes: uniqueValues([...current.constraints.notes, '路线偏好：尽量顺路，减少绕行']),
          },
        }
      case 'remove_time_slot':
        return timeSlot
          ? { ...current, itinerary: current.itinerary.map(plan => (day && plan.day !== day ? plan : removeTimeSlotFromPlan(plan, timeSlot))) }
          : current
      case 'update_preference':
        return { ...current, preferences: uniqueValues([...current.preferences, ...categories]) }
      case 'update_budget':
        return {
          ...current,
          budget: {
            mode: (patch.payload?.budgetMode as TripState['budget']['mode'] | undefined) || 'breakdown',
            categories: (patch.payload?.budgetCategories as string[] | undefined) || budgetBreakdownCategories,
          },
        }
      case 'record_note':
        return {
          ...current,
          constraints: { ...current.constraints, notes: uniqueValues([...current.constraints.notes, String(patch.payload?.note || '')]) },
        }
      default:
        return current
    }
  }, state)
}

export const applyPatch = (state: TripState, patch: TripPatch) => applyPatches(state, [patch])
export const applyTripPatch = applyPatch

function changedDays(beforeState: TripState, afterState: TripState) {
  return beforeState.itinerary.filter(plan => normalizePlanText(plan) !== normalizePlanText(getPlanByDay(afterState, plan.day))).map(plan => plan.day)
}

function normalizePlanText(plan?: DayPlan) {
  return plan ? JSON.stringify(plan) : ''
}

export function validatePatchResult(
  beforeState: TripState,
  afterState: TripState,
  commandsOrParsed: TravelEditCommand[] | { commands: TravelEditCommand[] },
  _patches: TripPatch[] = [],
): PatchValidationResult {
  const commands = Array.isArray(commandsOrParsed) ? commandsOrParsed : commandsOrParsed.commands
  const failures: string[] = []
  const changed = changedDays(beforeState, afterState)
  commands.forEach(command => {
    if (command.operation === 'clarify' || command.operation === 'record' || command.operation === 'unsupported') return
    if (command.scope === 'constraint' && command.payload?.avoidPlaces) {
      const missing = command.payload.avoidPlaces.filter(place => !afterState.constraints.avoidPlaces.includes(place))
      if (missing.length > 0) failures.push(`avoidPlaces 未写入：${missing.join('、')}`)
    }
    if (command.scope === 'constraint' && command.payload?.categories) {
      const missing = command.payload.categories.filter(category => !afterState.constraints.avoidCategories.includes(category))
      if (missing.length > 0) failures.push(`avoidCategories 未写入：${missing.join('、')}`)
    }
    if (command.scope === 'activity' && (command.operation === 'add' || command.operation === 'recommend')) {
      const day = command.target?.day
      const dayPlan = getPlanByDay(afterState, day)
      const items = dayPlan?.items || []
      const category = command.payload?.activityCategory
      if (!dayPlan || !category || !items.some(item => item.type === category || (category === 'restaurant' && item.type === 'restaurant'))) failures.push(`Day ${day} 没有新增 ${category} item`)
      const timeIntents = command.payload?.timeIntents || []
      const missingTime = timeIntents.filter(timeIntent => !items.some(item => item.timeIntent === timeIntent))
      if (missingTime.length > 0) failures.push(`timeIntent 未写入：${missingTime.join('、')}`)
      if (command.payload?.locationConstraint && !items.some(item => item.locationConstraint)) failures.push('locationConstraint 未写入 item')
    }
    if (command.scope === 'place' && command.operation === 'add' && command.target?.place) {
      const day = command.target.day
      const planText = normalizePlanText(getPlanByDay(afterState, day))
      if (!planText.includes(command.target.place)) failures.push(`Day ${day} 没有新增 ${command.target.place}`)
    }
    if ((command.operation === 'replace' || command.operation === 'regenerate') && command.scope === 'day') {
      if (!command.target?.day || !changed.includes(command.target.day)) failures.push(`Day ${command.target?.day} 没有更新`)
      const avoidPlaces = command.payload?.avoidPlaces || []
      const planText = normalizePlanText(getPlanByDay(afterState, command.target?.day))
      const stillExists = avoidPlaces.filter(place => planText.includes(place))
      if (stillExists.length > 0) failures.push(`旧地点仍存在：${stillExists.join('、')}`)
    }
    if (command.scope === 'budget' && command.payload?.budgetMode === 'breakdown') {
      if (afterState.budget.mode !== 'breakdown' || afterState.budget.categories.length === 0) failures.push('预算拆分没有开启')
    }
    if (command.scope === 'time_slot' && command.target?.timeSlot) {
      const period = commandSlotToPeriod[command.target.timeSlot]
      const plans = command.target.day ? [getPlanByDay(afterState, command.target.day)] : afterState.itinerary
      const invalid = plans.some(plan => {
        const slot = plan?.slots.find(item => item.period === period)
        return !slot || !slot.activities.every(activity => /自由活动|休息/.test(activity))
      })
      if (invalid) failures.push(`${period}没有变成自由活动`)
    }
  })
  return { ok: failures.length === 0, reason: failures.join('；') || undefined, changedDays: changed }
}

function joinChineseList(items: string[]) {
  if (items.length <= 1) return items.join('')
  return items.slice(0, -1).join('、') + '和' + items[items.length - 1]
}

function timeIntentLabel(timeIntent: TimeIntent) {
  const labels: Record<TimeIntent, string> = {
    breakfast: '早餐',
    morning: '上午',
    lunch: '午餐',
    noon: '中午',
    afternoon: '下午',
    tea_time: '下午茶',
    dinner: '晚餐',
    evening: '晚上',
    night: '夜间',
    late_night: '夜宵',
  }
  return labels[timeIntent]
}

function getActivityReplyLabel(category?: ActivityCategory) {
  if (!category) return '活动'
  return categoryLabel(category)
}

export function generateReplyFromDiff(
  beforeState: TripState,
  afterState: TripState,
  commands: TravelEditCommand[],
  validation: PatchValidationResult,
): string {
  if (!validation.ok) return `这次修改没有成功应用到行程数据里，我需要重新尝试。原因：${validation.reason || '未知错误'}。`
  const clarify = commands.find(command => command.operation === 'clarify')
  if (clarify) return clarify.payload?.note || '我需要确认一下：你想新增、替换、删除，还是调整这段行程？'
  const activityCommand = commands.find(command => command.scope === 'activity' && (command.operation === 'add' || command.operation === 'recommend'))
  if (activityCommand) {
    const day = activityCommand.target?.day
    const times = activityCommand.payload?.timeIntents?.map(timeIntentLabel) || []
    const category = getActivityReplyLabel(activityCommand.payload?.activityCategory)
    const location = activityCommand.payload?.locationConstraint
    const anchor = location?.type === 'near_hotel'
      ? '酒店附近'
      : location?.anchorPlace
        ? `${location.anchorPlace}附近`
        : location?.type === 'on_route'
          ? '顺路范围'
          : location?.type === 'minimal_detour'
            ? '不绕路的范围'
            : ''
    return `好的，我会在${day ? ` Day ${day}` : ''}${times.length > 0 ? ` 增加${joinChineseList(times)}` : ' 增加'}${category}推荐${anchor ? `，范围放在${anchor}` : ''}。`
  }
  const addPlaceCommand = commands.find(command => command.operation === 'add' && command.scope === 'place')
  if (addPlaceCommand?.target?.place) {
    return `好的，我已把${addPlaceCommand.target.place}加入 Day ${addPlaceCommand.target.day || 1}，行程卡片和地图会同步更新。`
  }
  const budget = commands.find(command => command.scope === 'budget')
  if (budget && afterState.budget.mode === 'breakdown') return `好的，我会在行程中增加预算拆分，包括${joinChineseList(afterState.budget.categories)}。`
  const avoidPlaces = uniqueValues(commands.flatMap(command => command.payload?.avoidPlaces || []))
  const dayRegenerate = commands.find(command => command.operation === 'regenerate' && command.scope === 'day')
  if (dayRegenerate?.target?.day) return avoidPlaces.length > 0 ? `好的，我会重新规划 Day ${dayRegenerate.target.day}，并避开${joinChineseList(avoidPlaces)}。` : `好的，我已重新规划 Day ${dayRegenerate.target.day}。`
  const replaceDay = commands.find(command => command.operation === 'replace' && command.scope === 'day')
  if (replaceDay?.target?.day) {
    const plan = getPlanByDay(afterState, replaceDay.target.day)
    return `好的，我已将 Day ${replaceDay.target.day} 调整为${plan?.title || replaceDay.payload?.theme || '新的全天'}安排。`
  }
  const adjustDay = commands.find(command => command.operation === 'adjust' && (command.scope === 'day' || command.scope === 'map_route'))
  if (adjustDay) return adjustDay.target?.day ? `可以，我会在 Day ${adjustDay.target.day} 中间加入休息时间，让路线更轻松。` : '可以，我会按尽量顺路、减少绕行的方式调整后续安排。'
  const removeTime = commands.find(command => command.operation === 'remove' && command.scope === 'time_slot')
  if (removeTime) {
    const period = removeTime.target?.timeSlot ? commandSlotToPeriod[removeTime.target.timeSlot] : '对应时段'
    return removeTime.target?.day ? `已把 Day ${removeTime.target.day} 的${period}改为自由活动或休息。` : `已把${period}改为自由活动或休息。`
  }
  const preferenceCategories = uniqueValues(commands.flatMap(command => command.scope === 'preference' ? command.payload?.categories || [] : []))
  const avoidCategories = uniqueValues(commands.flatMap(command => command.scope === 'constraint' ? command.payload?.categories || [] : []))
  if (avoidCategories.length > 0 && preferenceCategories.length > 0) {
    return `已记录不再优先安排${joinChineseList(avoidCategories)}类内容，并把${joinChineseList(preferenceCategories)}作为替代偏好。相关行程卡片和地图点位会同步更新。`
  }
  if (preferenceCategories.length > 0) return `好的，我会在后续行程中增加${joinChineseList(preferenceCategories)}/休息点。`
  if (avoidCategories.length > 0) return `已记录，后续会减少${joinChineseList(avoidCategories)}类安排。`
  const moveCommand = commands.find(command => command.operation === 'move' && command.scope === 'place')
  if (moveCommand?.target?.place && moveCommand.target.day) return `已把${moveCommand.target.place}移动到 Day ${moveCommand.target.day}，行程卡片和地图已同步更新。`
  if (beforeState.constraints.notes.length !== afterState.constraints.notes.length) return '我先帮你记录下这个想法，等你补充具体方向后再调整行程。'
  return '已根据你的反馈更新行程，行程卡片和地图会同步反映变化。'
}

export function processUserFeedback(input: string, state: TripState) {
  const hints = extractSurfaceHints(input, state)
  const frames = semanticFrameParser(input, state, hints)
  const parseResult = parseResultFromFrames(frames)
  return processParsedFeedback(input, state, parseResult, hints, frames)
}

function parseResultFromFrames(frames: TravelTaskFrame[]): ParseResult {
  const commands = framesToCommands(frames)
  return {
    commands,
    confidence: commands.reduce((sum, command) => sum + command.confidence, 0) / commands.length,
    actionMode: getOverallActionMode(commands),
    userFacingMessage: frames.find(frame => frame.needsClarification)?.clarificationQuestion,
  }
}

export function processParsedFeedback(
  input: string,
  state: TripState,
  parseResult: ParseResult,
  hints = extractSurfaceHints(input, state),
  frames = semanticFrameParser(input, state, hints),
) {
  const patches = parseResult.actionMode === 'execute' || parseResult.actionMode === 'confirm' || parseResult.actionMode === 'record' ? commandsToPatches(parseResult.commands, state) : []
  const afterState = patches.length > 0 ? applyPatches(state, patches) : state
  const validation = parseResult.actionMode === 'clarify' ? { ok: true, changedDays: [] } : validatePatchResult(state, afterState, parseResult.commands, patches)
  const reply = generateReplyFromDiff(state, afterState, parseResult.commands, validation)
  const aiResult: AIResult = {
    reply,
    intent: parseResult.commands.map(command => `${command.operation}:${command.scope}`).join('+'),
    scope: parseResult.commands[0]?.scope === 'note' ? 'constraint' : (parseResult.commands[0]?.scope === 'place' ? 'item' : parseResult.commands[0]?.scope || 'trip') as AIResult['scope'],
    patch: patches[0] || { operation: 'record_note', payload: { note: input } },
  }
  return {
    rawInput: input,
    hints,
    travelTaskFrames: frames,
    parseResult,
    commands: parseResult.commands,
    patches,
    nextState: validation.ok ? afterState : state,
    validation,
    aiResult,
    debug: {
      rawInput: input,
      extractedHints: hints,
      travelTaskFrames: frames,
      commands: parseResult.commands,
      patches,
      validationResult: validation,
      actionMode: parseResult.actionMode,
    },
  }
}

export const parseItineraryIntent = (input: string, state: TripState) => semanticParseUserFeedback(input, state)
export const createMockAIResult = parseItineraryIntent
export const createAIResult = (_parsed: unknown, _afterState: TripState, validation: PatchValidationResult): AIResult => ({
  reply: validation.ok ? '已更新。' : `这次修改没有成功应用到行程数据里：${validation.reason || '未知错误'}。`,
  intent: 'legacy',
  scope: 'trip',
  patch: { operation: 'record_note' },
})
