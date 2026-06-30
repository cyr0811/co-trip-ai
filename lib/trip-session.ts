import { preferenceTags } from './mock-data'
import { buildPlanningConstraints, extractCandidatePlaces } from './trip-candidates'
import { generateCandidateDrivenPlans } from './trip-route-planner'
import type {
  ChatMessage,
  DayIntensity,
  DayPlan,
  Place,
  MissingTripInfo,
  StayInfo,
  TripClarificationDetails,
  TripGeoLocation,
  TripProfileField,
  TripSession,
  TripTransportBoundary,
} from './types'

const destinationCandidates = [
  '东京', '大阪', '京都', '成都', '重庆', '北京', '上海', '杭州', '南京', '西安', '广州', '深圳',
  '香港', '澳门', '台北', '首尔', '釜山', '曼谷', '清迈', '新加坡', '巴黎', '伦敦', '罗马',
  '巴塞罗那', '纽约', '洛杉矶', '旧金山', '悉尼', '墨尔本', '冰岛', '北海道', '冲绳',
]

const cityBlueprints: Record<string, string[]> = {
  东京: ['新宿', '浅草', '上野', '原宿', '表参道', '涩谷', '银座', '筑地', '台场', '代官山'],
  大阪: ['难波', '心斋桥', '道顿堀', '梅田', '大阪城', '天王寺', '中崎町', '环球影城'],
  京都: ['祇园', '清水寺', '岚山', '伏见稻荷', '锦市场', '鸭川', '二条城', '河原町'],
  成都: ['宽窄巷子', '锦里', '太古里', '人民公园', '武侯祠', '熊猫基地', '九眼桥', '杜甫草堂'],
  重庆: ['解放碑', '洪崖洞', '十八梯', '鹅岭二厂', '李子坝', '磁器口', '南山', '观音桥'],
  北京: ['天安门', '故宫', '景山', '什刹海', '南锣鼓巷', '颐和园', '798', '三里屯'],
  上海: ['外滩', '豫园', '南京东路', '人民广场', '武康路', '新天地', '陆家嘴', '田子坊'],
  杭州: ['西湖', '灵隐寺', '河坊街', '南山路', '小河直街', '良渚', '西溪湿地', '湖滨'],
  西安: ['钟楼', '鼓楼', '回民街', '城墙', '陕西历史博物馆', '大雁塔', '兵马俑', '大唐不夜城'],
  曼谷: ['暹罗', '大皇宫', '郑王庙', '湄南河', '恰图恰', '唐人街', '通罗', 'ICONSIAM'],
  首尔: ['明洞', '景福宫', '北村', '弘大', '圣水洞', '汉江', '东大门', '梨泰院'],
}

const defaultAreas = ['老城区', '核心商圈', '历史街区', '城市公园', '美食街', '博物馆区', '河岸/海边', '设计街区']

const coordinatePresets = [
  { x: 28, y: 48 },
  { x: 40, y: 42 },
  { x: 56, y: 44 },
  { x: 64, y: 54 },
  { x: 50, y: 62 },
  { x: 34, y: 60 },
  { x: 22, y: 55 },
  { x: 72, y: 36 },
]

const tagLabelById = new Map(preferenceTags.map(tag => [tag.id, tag.label]))

function normalizeInput(input: string) {
  return input.trim() || '第一次去东京，玩 6 天，想轻松一点'
}

function parseDestination(input: string) {
  const explicit = destinationCandidates.find(city => input.includes(city))
  if (explicit) return explicit

  const match = input.match(/(?:去|到|游|玩)\s*([^\s，,。；;、]+?)(?:玩|旅行|旅游|自由行|\d|[一二两三四五六七八九十])/)
  return match?.[1] || '东京'
}

function parseChineseNumber(value: string) {
  const map: Record<string, number> = {
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

  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (map[value[1]] || 0)
  if (value.endsWith('十')) return (map[value[0]] || 1) * 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (map[tens] || 1) * 10 + (map[ones] || 0)
  }

  return map[value] || 0
}

function parseDays(input: string) {
  const digitMatch = input.match(/(\d{1,2})\s*(?:天|日|晚|days?|d)/i)
  if (digitMatch) return clampDays(Number(digitMatch[1]))

  const chineseMatch = input.match(/([一二两三四五六七八九十]{1,3})\s*(?:天|日|晚)/)
  if (chineseMatch) return clampDays(parseChineseNumber(chineseMatch[1]))

  if (input.includes('周末')) return 3
  return 6
}

function clampDays(days: number) {
  if (!Number.isFinite(days) || days <= 0) return 6
  return Math.min(Math.max(Math.round(days), 1), 6)
}

function inferPace(input: string, tags: string[]): DayIntensity {
  if (tags.includes('relaxed') || tags.includes('walk-less') || /轻松|慢|不赶|少走|休闲/.test(input)) return '轻松'
  if (/紧凑|多玩|打卡|特种兵|排满/.test(input)) return '较满'
  return '适中'
}

function inferInterests(input: string, tags: string[]) {
  const interests = new Set<string>()

  if (tags.includes('food') || /美食|吃|餐厅|小吃|咖啡|酒/.test(input)) interests.add('美食')
  if (tags.includes('classic') || /经典|第一次|地标|必去/.test(input)) interests.add('经典路线')
  if (tags.includes('photo') || /拍照|出片|街区|城市/.test(input)) interests.add('拍照与街区')
  if (tags.includes('budget') || /预算|便宜|省钱|低预算/.test(input)) interests.add('控制预算')
  if (/购物|买|商场|中古|品牌/.test(input)) interests.add('购物')
  if (/博物馆|展览|历史|文化|寺|神社|古城/.test(input)) interests.add('文化体验')

  if (interests.size === 0) {
    interests.add('经典路线')
    interests.add('美食')
    interests.add('城市街区')
  }

  return Array.from(interests).slice(0, 4)
}

function inferConstraints(input: string, tags: string[], pace: DayIntensity) {
  const constraints = new Set<string>()

  if (pace === '轻松') constraints.add('不想每天太赶')
  if (tags.includes('walk-less') || /少走|不想走太多|腿脚/.test(input)) constraints.add('减少步行和跨区移动')
  if (tags.includes('budget') || /预算|便宜|省钱|低预算/.test(input)) constraints.add('预算需要控制')
  if (/老人|小孩|亲子|带娃|父母/.test(input)) constraints.add('需要照顾同行人体力')

  if (constraints.size === 0) constraints.add('保留弹性时间')

  return Array.from(constraints)
}

function normalizeBudgetLevel(value?: string) {
  if (!value) return undefined
  const compact = value.replace(/\s+/g, '')
  const amountText = compact.match(/(\d+(?:\.\d+)?)/)?.[1]
  if (!amountText) return compact

  const amount = Number(amountText)
  const prettyAmount = Number.isInteger(amount) ? String(amount) : amountText

  if (/[wW万]/.test(compact)) return prettyAmount + '万元左右'
  if (/[kK]/.test(compact)) return prettyAmount + '元左右'
  if (/(元|块)/.test(compact)) return prettyAmount + '元左右'
  if (/左右|大概|约|预算/.test(compact)) return prettyAmount + '元左右'

  return compact
}

function normalizeDailyStartTime(value?: string) {
  if (!value) return undefined
  const hour = value.match(/(\d{1,2})/)?.[1]
  if (!hour) return value
  return '早上' + hour.padStart(2, '0') + ':00后'
}

function normalizeClockTime(value?: string, preference: 'first' | 'last' = 'first') {
  if (!value) return undefined
  const matches = Array.from(value.matchAll(/(\d{1,2})\s*(?:点|:|：)\s*(半|\d{1,2})?/g))
  const match = preference === 'last' ? matches.at(-1) : matches[0]
  if (!match) return undefined
  const hour = match[1].padStart(2, '0')
  const minute = match[2] === '半' ? '30' : (match[2] || '00').padStart(2, '0')
  return `${hour}:${minute}`
}

function normalizeAirport(value?: string, destination = '') {
  const cleaned = cleanText(value)?.replace(/机场.*$/, '机场')
  if (!cleaned) return undefined
  if (/羽田/.test(cleaned)) return '羽田机场'
  if (/成田/.test(cleaned)) return '成田机场'
  if (/关西/.test(cleaned)) return '关西机场'
  if (/伊丹/.test(cleaned)) return '伊丹机场'
  if (/双流/.test(cleaned)) return '双流机场'
  if (/天府/.test(cleaned)) return '天府机场'
  return cleaned.includes('机场') ? cleaned : destination ? `${destination}机场` : cleaned
}

function sanitizeTransportBoundary(boundary?: Partial<TripTransportBoundary> | null, destination = '') {
  if (!boundary) return undefined
  const time = cleanText(boundary.time)
  const airport = normalizeAirport(boundary.airport, destination)
  const raw = cleanText(boundary.raw)
  if (!time && !airport && !raw) return undefined
  return {
    ...(time ? { time } : {}),
    ...(airport ? { airport } : {}),
    ...(raw ? { raw } : {}),
  } satisfies TripTransportBoundary
}

function parseTransportBoundary(input: string, destination: string, kind: 'arrival' | 'departure') {
  const airportPattern = '(?:羽田|成田|关西|伊丹|双流|天府|首都|大兴|浦东|虹桥|香港|澳门|桃园)?机场'
  const airportRegex = new RegExp(airportPattern)
  const clockRegex = /\d{1,2}\s*(?:点|:|：)\s*(?:半|\d{1,2})?/
  const clauses = input.split(/[，,。；;\n]/).map(item => item.trim()).filter(Boolean)
  const sharedAirportClause = clauses.find(clause => /第一天.*最后一天|最后一天.*第一天|都在/.test(clause) && airportRegex.test(clause))
  const airportClause = clauses.find(clause => (
    airportRegex.test(clause) &&
    (kind === 'arrival'
      ? /第一天|落地|抵达|到达|都在/.test(clause)
      : /最后一天|返程|回程|离开|飞走|出发|起飞|飞机|航班|都在/.test(clause))
  ))
  const timeClause = clauses.find(clause => (
    clockRegex.test(clause) &&
    (kind === 'arrival'
      ? /第一天|落地|抵达|到达/.test(clause)
      : /最后一天|返程|回程|离开|飞走|出发|起飞|飞机|航班/.test(clause))
  ))
  const arrivalPattern = new RegExp(`([^。；;\\n]{0,18}(?:抵达|到达|落地|到)\\s*(?:${destination})?\\s*${airportPattern}[^。；;\\n]{0,18}|[^。；;\\n]{0,18}${airportPattern}[^。；;\\n]{0,18}(?:抵达|到达|落地|到)[^。；;\\n]{0,18})`)
  const departurePattern = new RegExp(`([^。；;\\n]{0,18}(?:返程|回程|离开|飞走|出发|起飞|飞机|航班)\\s*(?:从)?\\s*(?:${destination})?\\s*${airportPattern}[^。；;\\n]{0,18}|[^。；;\\n]{0,18}${airportPattern}[^。；;\\n]{0,18}(?:返程|回程|离开|飞走|出发|起飞|飞机|航班)[^。；;\\n]{0,18})`)
  const fallbackRaw = input.match(kind === 'arrival' ? arrivalPattern : departurePattern)?.[0]
  const rawParts = Array.from(new Set([airportClause || sharedAirportClause, timeClause].filter(Boolean)))
  const raw = rawParts.length > 0 ? rawParts.join('，') : fallbackRaw
  if (!raw) return undefined
  const airport = normalizeAirport((airportClause || sharedAirportClause || raw).match(airportRegex)?.[0], destination)
  const time = normalizeClockTime(timeClause || raw, kind === 'departure' ? 'last' : 'first')
  if (!airport && !time) return undefined
  return {
    ...(time ? { time } : {}),
    ...(airport ? { airport } : {}),
    raw: raw.trim(),
  } satisfies TripTransportBoundary
}

function normalizeLodgingArea(area?: string, suffix = '') {
  if (!area) return undefined
  const cleaned = area.trim()
  if (!cleaned) return undefined
  if (suffix) return cleaned + suffix
  if (/太古里|春熙路/.test(cleaned) && !/附近|周边|一带|区域$/.test(cleaned)) return cleaned + '附近'
  return cleaned
}

const knownStayAreas = [
  '大手町', '太古里', '春熙路', '新宿', '涩谷', '银座', '浅草', '上野', '原宿', '表参道',
  '池袋', '东京站', '丸之内', '日本桥', '六本木', '难波', '心斋桥', '梅田', '祇园', '河原町',
  '宽窄巷子', '锦里', '人民公园', '解放碑', '洪崖洞', '三里屯', '外滩', '湖滨',
]

function cleanText(value?: string | null) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const normalized = trimmed.toLowerCase()
  if (normalized === 'null' || normalized === 'undefined' || trimmed === '未知') return undefined
  return trimmed
}

function createProfileField(value?: string | null, status: TripProfileField['status'] = 'confirmed'): TripProfileField | undefined {
  const cleaned = cleanText(value)
  if (!cleaned) return undefined
  return { raw: cleaned, value: cleaned, status, source: 'user' }
}

function createEmptyGeoLocation(status: TripGeoLocation['status'] = 'missing'): TripGeoLocation {
  return { lat: null, lng: null, placeId: null, status }
}

function sanitizeProfileField(field?: Partial<TripProfileField> | null, fallbackStatus: TripProfileField['status'] = 'confirmed') {
  const value = cleanText(field?.value || field?.raw)
  if (!value) return undefined

  return {
    raw: cleanText(field?.raw) || value,
    value,
    status: field?.status || fallbackStatus,
    source: field?.source || 'user',
  } satisfies TripProfileField
}

function sanitizeGeoLocation(geoLocation?: Partial<TripGeoLocation> | null, hasStayClueValue = false): TripGeoLocation {
  const status = geoLocation?.status || (hasStayClueValue ? 'pending_geocode' : 'missing')
  return {
    lat: typeof geoLocation?.lat === 'number' ? geoLocation.lat : null,
    lng: typeof geoLocation?.lng === 'number' ? geoLocation.lng : null,
    placeId: cleanText(geoLocation?.placeId) || null,
    status,
  }
}

function getFieldValue(field?: Partial<TripProfileField>) {
  return cleanText(field?.value || field?.raw)
}

function looksLikeHotelName(value?: string) {
  if (!value) return false
  return /酒店|旅馆|旅舍|民宿|宾馆|客栈|公寓|Hotel|hotel|HOSHINOYA|虹夕诺雅|星野|日式旅馆/i.test(value)
}

function extractKnownStayArea(input: string) {
  const area = knownStayAreas.find(candidate => input.includes(candidate))
  if (!area) return undefined
  if (/太古里|春熙路/.test(area) && new RegExp(area + '(?:附近|周边|一带)').test(input)) return area + '附近'
  return area
}

function extractHotelAddress(input: string) {
  const explicit = input.match(/(?:具体酒店地址|酒店地址|详细地址|住址|地址)(?:是|为)?\s*[:：]?\s*([^，。；;、/\n]+)/)?.[1]
  const cleaned = cleanText(explicit)
  if (!cleaned || /^(已提供|待补充|具体酒店地址|酒店地址)$/.test(cleaned)) return undefined
  return cleaned
}

function parseStayInfo(input: string): StayInfo | undefined {
  const lodgingMatch = input.match(/(?:打算住在|准备住在|计划住在|住在|住到|住宿在|住宿|订在|定在)\s*([^，。；;、/\n]+?)(附近|周边|区域|一带|那边)?(?=[,，。；;、/\n]|$)/)
  const lodgingValue = cleanText(lodgingMatch?.[1])
  const lodgingSuffix = lodgingMatch?.[2] || ''
  const hotelName = looksLikeHotelName(lodgingValue) ? lodgingValue : undefined
  const areaFromLodging = lodgingValue && !hotelName ? normalizeLodgingArea(lodgingValue, lodgingSuffix) : undefined
  const stayArea = areaFromLodging || extractKnownStayArea(input)
  const hotelAddress = extractHotelAddress(input)

  return buildStayInfo({
    stayArea,
    hotelName,
    hotelAddress,
  })
}

function buildStayInfo(values: { stayArea?: string; hotelName?: string; hotelAddress?: string }): StayInfo | undefined {
  const stayArea = createProfileField(values.stayArea)
  const hotelName = createProfileField(values.hotelName)
  const hotelAddress = createProfileField(values.hotelAddress, 'user_provided')
  const hasClue = Boolean(stayArea || hotelName || hotelAddress)

  if (!hasClue) return undefined

  return {
    ...(stayArea ? { stayArea } : {}),
    ...(hotelName ? { hotelName } : {}),
    ...(hotelAddress ? { hotelAddress } : {}),
    geoLocation: createEmptyGeoLocation('pending_geocode'),
  }
}

function buildStayInfoFromLegacy(details: Partial<TripClarificationDetails>) {
  const lodgingValue = cleanText(details.lodgingArea)
  const stayArea = lodgingValue && !looksLikeHotelName(lodgingValue) ? normalizeLodgingArea(lodgingValue) : undefined
  const hotelName = lodgingValue && looksLikeHotelName(lodgingValue) ? lodgingValue : undefined
  return buildStayInfo({
    stayArea,
    hotelName,
    hotelAddress: cleanText(details.hotelAddress),
  })
}

function hasStayClue(stayInfo?: StayInfo) {
  return Boolean(
    getFieldValue(stayInfo?.stayArea) ||
    getFieldValue(stayInfo?.hotelName) ||
    getFieldValue(stayInfo?.hotelAddress),
  )
}

function sanitizeStayInfo(stayInfo?: Partial<StayInfo> | null): StayInfo | undefined {
  if (!stayInfo) return undefined

  const next: StayInfo = {
    ...(sanitizeProfileField(stayInfo.stayArea) ? { stayArea: sanitizeProfileField(stayInfo.stayArea) } : {}),
    ...(sanitizeProfileField(stayInfo.hotelName) ? { hotelName: sanitizeProfileField(stayInfo.hotelName) } : {}),
    ...(sanitizeProfileField(stayInfo.hotelAddress, 'user_provided')
      ? { hotelAddress: sanitizeProfileField(stayInfo.hotelAddress, 'user_provided') }
      : {}),
    geoLocation: createEmptyGeoLocation(),
  }

  if (!hasStayClue(next) && !stayInfo.geoLocation) return undefined
  next.geoLocation = sanitizeGeoLocation(stayInfo.geoLocation, hasStayClue(next))
  return next
}

function mergeStayInfo(existing?: StayInfo, patch?: StayInfo): StayInfo | undefined {
  const current = sanitizeStayInfo(existing)
  const update = sanitizeStayInfo(patch)

  if (!current && !update) return undefined

  const next: StayInfo = {
    ...(current?.stayArea ? { stayArea: current.stayArea } : {}),
    ...(current?.hotelName ? { hotelName: current.hotelName } : {}),
    ...(current?.hotelAddress ? { hotelAddress: current.hotelAddress } : {}),
    ...(update?.stayArea ? { stayArea: update.stayArea } : {}),
    ...(update?.hotelName ? { hotelName: update.hotelName } : {}),
    ...(update?.hotelAddress ? { hotelAddress: update.hotelAddress } : {}),
    geoLocation: update?.geoLocation || current?.geoLocation || createEmptyGeoLocation(),
  }

  if (!hasStayClue(next)) return undefined

  if (next.geoLocation.status === 'missing') {
    next.geoLocation = createEmptyGeoLocation('pending_geocode')
  }

  return next
}

function parseClarificationDetails(input: string, destinationOverride?: string): TripClarificationDetails {
  const destination = destinationOverride || parseDestination(input)
  const travelTime = input.match(/(?:\d{1,2}\s*月|春季|夏季|秋季|冬季|春节|清明|五一|端午|暑假|国庆|中秋|寒假|周末|月底|月初)/)?.[0]?.replace(/\s+/g, '')

  const startMatch = input.match(/(?:每天|每日)[^。；;\n]{0,12}?(\d{1,2})\s*[点:：](?:\s*(\d{1,2})\s*分?)?(?:后|左右|开始|出发)?|(?:希望|想|打算|计划|准备)[^。；;\n]{0,8}?(\d{1,2})\s*[点:：](?:\s*(\d{1,2})\s*分?)?(?:后|左右|开始|出发)/)
  const dailyStartTime = startMatch && !/(机场|落地|抵达|到达|飞机|航班|返程|起飞)/.test(startMatch[0])
    ? normalizeDailyStartTime(startMatch[0])
    : undefined

  const budgetTextMatch = input.match(/(?:低预算|中等预算|高预算|预算宽松|相对宽松|省钱|经济型|不差钱)/)?.[0]
  const budgetAmountMatch = input.match(/(?:预算|预算为|预算大概|预算大概为|费用|花费)[^，。；;\n]*?(\d+(?:\.\d+)?\s*(?:[kK]|[wW]|万|千|元|块)?)(?:左右|以内|上下)?/)?.[0]
  const budgetLevel = normalizeBudgetLevel(budgetTextMatch || budgetAmountMatch)
  const stayInfo = parseStayInfo(input)
  const stayArea = getFieldValue(stayInfo?.stayArea)
  const hotelAddress = getFieldValue(stayInfo?.hotelAddress)
  const arrivalInfo = parseTransportBoundary(input, destination, 'arrival')
  const departureInfo = parseTransportBoundary(input, destination, 'departure')

  return {
    ...(travelTime ? { travelTime } : {}),
    ...(stayArea ? { lodgingArea: stayArea } : {}),
    ...(hotelAddress ? { hotelAddress } : {}),
    ...(stayInfo ? { stayInfo } : {}),
    ...(dailyStartTime ? { dailyStartTime } : {}),
    ...(budgetLevel ? { budgetLevel } : {}),
    ...(arrivalInfo ? { arrivalInfo } : {}),
    ...(departureInfo ? { departureInfo } : {}),
  }
}

function buildMissingInfo(destination: string, details: TripClarificationDetails): MissingTripInfo[] {
  const stayInfo = mergeStayInfo(details.stayInfo, buildStayInfoFromLegacy(details))
  const hasLodgingClue = hasStayClue(stayInfo)
  const geoStatus = stayInfo?.geoLocation.status
  const items: MissingTripInfo[] = []

  if (!details.travelTime) {
    items.push({ id: 'travelTime', label: '出行时间', prompt: '大概几月或什么时候出行' })
  }

  if (!details.arrivalInfo?.time || !details.arrivalInfo?.airport) {
    items.push({ id: 'arrivalInfo', label: '落地信息', prompt: '第一天大概几点落地、到哪个机场或车站' })
  }

  if (!details.departureInfo?.time || !details.departureInfo?.airport) {
    items.push({ id: 'departureInfo', label: '返程信息', prompt: '最后一天大概几点返程、从哪个机场或车站出发' })
  }

  if (!hasLodgingClue) {
    items.push({ id: 'stayArea', label: '住宿区域', prompt: '住宿是否已定在' + destination + '某个区域' })
  }

  if (geoStatus === 'ambiguous') {
    items.push({ id: 'geoLocation', label: '地图候选确认', prompt: '地图返回了多个住宿地点候选，需要你确认具体是哪一个' })
  }

  if (geoStatus === 'failed') {
    items.push({ id: 'geoLocation', label: '住宿地点详情', prompt: '地图暂时无法解析住宿地点，请补充更详细地址或英文名称' })
  }

  if (!details.dailyStartTime) {
    items.push({ id: 'dailyStartTime', label: '每日开始时间', prompt: '每天希望几点左右开始' })
  }

  if (!details.budgetLevel) {
    items.push({ id: 'budgetLevel', label: '预算水平', prompt: '预算大概是什么水平' })
  }

  return items
}

function getAreas(destination: string) {
  return cityBlueprints[destination] || defaultAreas.map(area => `${destination}${area}`)
}

function createPlace(destination: string, area: string, index: number, type: Place['type']): Place {
  const coordinate = coordinatePresets[index % coordinatePresets.length]

  return {
    id: `${destination}-${area}-${index}`.replace(/\s+/g, '-').toLowerCase(),
    name: area,
    type,
    x: coordinate.x,
    y: coordinate.y,
  }
}

function generatePlans(destination: string, days: number, pace: DayIntensity, interests: string[]): DayPlan[] {
  const areas = getAreas(destination)
  const wantsFood = interests.includes('美食')
  const wantsShopping = interests.includes('购物') || interests.includes('拍照与街区')
  const wantsCulture = interests.includes('文化体验') || interests.includes('经典路线')

  return Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const first = areas[(index * 2) % areas.length]
    const second = areas[(index * 2 + 1) % areas.length]
    const third = areas[(index * 2 + 2) % areas.length]
    const isArrival = day === 1
    const isFinal = day === days
    const intensity: DayIntensity = isArrival || isFinal ? '轻松' : pace
    const places = [
      createPlace(destination, first, index * 2, wantsCulture ? 'attraction' : 'shopping'),
      createPlace(destination, second, index * 2 + 1, wantsFood ? 'food' : 'attraction'),
    ]

    if (!isArrival && !isFinal && pace !== '轻松') {
      places.push(createPlace(destination, third, index * 2 + 2, wantsShopping ? 'shopping' : 'attraction'))
    }

    return {
      day,
      title: isArrival ? `抵达${destination}` : isFinal ? `${destination}弹性收尾` : `${first} + ${second}`,
      theme: isArrival
        ? '抵达适应与周边漫步'
        : isFinal
          ? '轻松补漏与返程准备'
          : wantsFood
            ? '街区探索与美食体验'
            : wantsCulture
              ? '经典地标与文化体验'
              : '城市街区探索',
      intensity,
      slots: [
        {
          period: '上午',
          activities: isArrival
            ? ['抵达后前往住宿区域', '寄存行李或办理入住']
            : [`${first}区域游览`, wantsCulture ? '安排一个代表性地标/文化点' : '保留自由探索时间'],
        },
        {
          period: '下午',
          activities: isFinal
            ? ['购买伴手礼', '回到住宿区整理行李']
            : [`前往${second}`, wantsFood ? '安排当地特色小吃或咖啡休息' : '选择一段轻松步行路线'],
        },
        {
          period: '晚上',
          activities: isFinal
            ? ['返程或自由活动']
            : [wantsFood ? `${destination}特色晚餐` : `${destination}夜间街区散步`, '根据体力决定是否加点活动'],
        },
      ],
      reason: `根据你输入的「${destination}」「${days} 天」和「${interests.join('、')}」偏好，先把第 ${day} 天安排成区域相对集中的初步大纲，后续可以继续细化到具体景点、餐厅和交通。`,
      places,
      estimatedTransport: intensity === '轻松' ? '约 20-35 分钟' : intensity === '适中' ? '约 35-55 分钟' : '约 60-80 分钟',
    }
  })
}

function transportPlace(destination: string, boundary: TripTransportBoundary, id: string): Place {
  return {
    id,
    name: boundary.airport || `${destination}交通枢纽`,
    type: 'transport',
    x: id.includes('departure') ? 68 : 32,
    y: id.includes('departure') ? 58 : 38,
  }
}

function applyTransportBoundaryPlans(plans: DayPlan[], destination: string, details: TripClarificationDetails): DayPlan[] {
  if (!details.arrivalInfo && !details.departureInfo) return plans

  return plans.map(plan => {
    if (plan.day === 1 && details.arrivalInfo) {
      const arrivalLabel = [details.arrivalInfo.time, details.arrivalInfo.airport].filter(Boolean).join('抵达')
      return {
        ...plan,
        title: `抵达${destination} + 住宿周边`,
        theme: '落地日低强度适应',
        intensity: '轻松' as const,
        slots: [
          { period: '上午' as const, activities: [arrivalLabel || '抵达目的地', '入境/取行李/前往住宿区域'] },
          { period: '下午' as const, activities: ['办理入住或寄存行李', '选择住宿周边步行可达的轻量街区'] },
          { period: '晚上' as const, activities: ['住宿周边晚餐', '不安排跨区景点，保留体力'] },
        ],
        places: [transportPlace(destination, details.arrivalInfo, 'arrival-airport'), ...plan.places.slice(0, 1)],
        estimatedTransport: '机场到市区约 60-90 分钟，市区内不再跨区',
        reason: '已把落地时间和机场作为 Day 1 的硬约束，因此第一天降低强度，只安排抵达、入住和住宿周边适应。',
      }
    }

    if (plan.day === plans.length && details.departureInfo) {
      const departureLabel = [details.departureInfo.time, details.departureInfo.airport].filter(Boolean).join('从')
      return {
        ...plan,
        title: `${destination}轻松收尾 + 返程`,
        theme: '返程日弹性收尾',
        intensity: '轻松' as const,
        slots: [
          { period: '上午' as const, activities: ['住宿周边轻量补漏或购买伴手礼', '避免安排远距离景点'] },
          { period: '下午' as const, activities: ['回住宿区域整理行李', departureLabel ? `预留时间前往${departureLabel}` : '预留时间前往机场或车站'] },
          { period: '晚上' as const, activities: ['返程', '不追加高强度活动'] },
        ],
        places: [...plan.places.slice(0, 1), transportPlace(destination, details.departureInfo, 'departure-airport')],
        estimatedTransport: '市区到机场约 60-90 分钟，建议额外预留安检和换乘时间',
        reason: '已把返程时间和机场作为最后一天硬约束，因此保留充足机动时间，避免影响返程。',
      }
    }

    return plan
  })
}

function buildQuestions(destination: string) {
  return [
    { id: 'month', text: '你大概几月出行？这会影响天气、旺季和预约建议。' },
    { id: 'hotel', text: `住宿是否已经定在${destination}某个区域，还是需要我推荐住宿范围？` },
    { id: 'start', text: '每天希望几点左右开始行程？' },
    { id: 'budget', text: '预算大概是低预算、中等预算，还是相对宽松？' },
  ]
}

function buildQuickOptions(destination: string, pace: DayIntensity) {
  return [
    { id: 'no-hotel', label: `还没订酒店，让 AI 推荐${destination}住宿区域`, color: 'sky' },
    { id: 'mid-budget', label: '预算按中等水平规划', color: 'mint' },
    { id: 'start-late', label: '每天 10 点后开始', color: 'peach' },
    { id: 'classic', label: `按第一次去${destination}的经典 + ${pace}路线规划`, color: 'primary' },
  ]
}

function buildRecognizedInfo(
  destination: string,
  days: number,
  travelerState: string,
  pace: DayIntensity,
  interests: string[],
  constraints: string[],
  details: TripClarificationDetails,
) {
  const stayInfo = mergeStayInfo(details.stayInfo, buildStayInfoFromLegacy(details))
  const stayArea = getFieldValue(stayInfo?.stayArea)
  const hotelName = getFieldValue(stayInfo?.hotelName)
  const formatBoundary = (boundary?: TripTransportBoundary) => {
    if (!boundary) return ''
    return [boundary.time, boundary.airport].filter(Boolean).join(' · ') || boundary.raw || ''
  }
  const arrivalText = formatBoundary(details.arrivalInfo)
  const departureText = formatBoundary(details.departureInfo)

  const orderedInfo = [
    { label: '目的地', value: destination },
    { label: '天数', value: String(days) + '天' },
    { label: '用户状态', value: travelerState },
    { label: '兴趣偏好', value: interests.join('、') },
    ...(details.travelTime ? [{ label: '出行时间', value: details.travelTime }] : []),
    ...(arrivalText ? [{ label: '落地信息', value: arrivalText }] : []),
    ...(departureText ? [{ label: '返程信息', value: departureText }] : []),
    ...(details.budgetLevel ? [{ label: '预算水平', value: normalizeBudgetLevel(details.budgetLevel) || details.budgetLevel }] : []),
    ...(stayArea ? [{ label: '住宿区域', value: stayArea }] : []),
    ...(hotelName ? [{ label: '酒店名称', value: hotelName }] : []),
    ...(details.dailyStartTime ? [{ label: '开始时间', value: normalizeDailyStartTime(details.dailyStartTime) || details.dailyStartTime }] : []),
    { label: '旅行节奏', value: pace },
    { label: '约束偏好', value: constraints.join('、') },
  ]

  return orderedInfo.filter(item => item.value && item.value.trim().length > 0)
}

export function createTripSession(input: string, selectedTags: string[]): TripSession {
  const userInput = normalizeInput(input)
  const destination = parseDestination(userInput)
  const days = parseDays(userInput)
  const pace = inferPace(userInput, selectedTags)
  const interests = inferInterests(userInput, selectedTags)
  const constraints = inferConstraints(userInput, selectedTags, pace)
  const selectedTagLabels = selectedTags.map(tag => tagLabelById.get(tag) || tag)
  const travelerState = /第一次|首次|没去过|初次/.test(userInput) ? `第一次去${destination}` : `${destination}自由行用户`
  const clarificationDetails = parseClarificationDetails(userInput, destination)
  const fallbackPlans = applyTransportBoundaryPlans(generatePlans(destination, days, pace, interests), destination, clarificationDetails)
  const candidatePlaces = extractCandidatePlaces(userInput, destination)
  const planningConstraints = buildPlanningConstraints(userInput, destination, days, pace, interests, constraints)
  const plans = applyTransportBoundaryPlans(generateCandidateDrivenPlans({
    destination,
    days,
    pace,
    interests,
    candidatePlaces,
    fallbackPlans,
  }), destination, clarificationDetails)
  const title = `${destination} ${days} 日${pace}自由行`
  const summary = `我先根据你的输入生成一版${destination} ${days} 天初步大纲，重点考虑${interests.join('、')}，并尽量满足${constraints.join('、')}。`
  const missingInfo = buildMissingInfo(destination, clarificationDetails)
  const recognizedInfo = buildRecognizedInfo(destination, days, travelerState, pace, interests, constraints, clarificationDetails)

  const initialMessages: ChatMessage[] = [
    {
      id: 'initial-outline',
      role: 'ai',
      content: `我已经根据你的首页输入生成了一版「${title}」初步大纲。现在的安排先按区域集中原则拆成 ${days} 天，每天保留可调整空间；你可以继续告诉我哪天太满、想换地点，或希望增加餐厅/预算/交通细节。`,
      timestamp: '刚刚',
    },
  ]

  return {
    userInput,
    selectedTags,
    selectedTagLabels,
    destination,
    days,
    pace,
    interests,
    constraints,
    travelerState,
    title,
    summary,
    recognizedInfo,
    clarificationDetails,
    missingInfo,
    candidatePlaces,
    planningConstraints,
    isReadyForPlanning: missingInfo.length === 0,
    questions: buildQuestions(destination),
    quickOptions: buildQuickOptions(destination, pace),
    loadingTexts: [
      `正在理解你关于${destination}的旅行想法…`,
      `正在根据${destination}区域关系生成初步路线…`,
      `正在检查 ${days} 天行程节奏和跨区移动…`,
      '正在生成可继续修改的初版大纲…',
    ],
    plans,
    initialMessages,
  }
}

function compactClarificationDetails(details: Partial<TripClarificationDetails>) {
  const compacted: Partial<TripClarificationDetails> = {}
  const travelTime = cleanText(details.travelTime)
  const lodgingArea = cleanText(details.lodgingArea)
  const hotelAddress = cleanText(details.hotelAddress)
  const dailyStartTime = cleanText(details.dailyStartTime)
  const budgetLevel = cleanText(details.budgetLevel)
  const arrivalInfo = sanitizeTransportBoundary(details.arrivalInfo)
  const departureInfo = sanitizeTransportBoundary(details.departureInfo)

  if (travelTime) compacted.travelTime = travelTime
  if (lodgingArea) compacted.lodgingArea = normalizeLodgingArea(lodgingArea)
  if (hotelAddress) compacted.hotelAddress = hotelAddress
  if (dailyStartTime) compacted.dailyStartTime = normalizeDailyStartTime(dailyStartTime)
  if (budgetLevel) compacted.budgetLevel = normalizeBudgetLevel(budgetLevel)
  if (arrivalInfo) compacted.arrivalInfo = arrivalInfo
  if (departureInfo) compacted.departureInfo = departureInfo

  const structuredStayInfo = sanitizeStayInfo(details.stayInfo)
  const legacyStayInfo = buildStayInfoFromLegacy(compacted)
  const stayInfo = mergeStayInfo(legacyStayInfo, structuredStayInfo)
  if (stayInfo) compacted.stayInfo = stayInfo

  return compacted
}

export function mergeTripSessionProfile(
  session: TripSession,
  details: Partial<TripClarificationDetails>,
): TripSession {
  const compactedDetails = compactClarificationDetails(details)
  const nextStayInfo = mergeStayInfo(session.clarificationDetails.stayInfo, compactedDetails.stayInfo)
  const nextDetails = {
    ...session.clarificationDetails,
    ...compactedDetails,
    ...(nextStayInfo ? { stayInfo: nextStayInfo } : {}),
  }

  if (nextStayInfo) {
    const stayArea = getFieldValue(nextStayInfo.stayArea)
    const hotelAddress = getFieldValue(nextStayInfo.hotelAddress)
    if (stayArea) nextDetails.lodgingArea = stayArea
    if (hotelAddress) nextDetails.hotelAddress = hotelAddress
  }

  const missingInfo = buildMissingInfo(session.destination, nextDetails)
  const nextPlans = applyTransportBoundaryPlans(session.plans, session.destination, nextDetails)

  return {
    ...session,
    clarificationDetails: nextDetails,
    missingInfo,
    candidatePlaces: session.candidatePlaces,
    planningConstraints: session.planningConstraints,
    plans: nextPlans,
    isReadyForPlanning: missingInfo.length === 0,
    recognizedInfo: buildRecognizedInfo(
      session.destination,
      session.days,
      session.travelerState,
      session.pace,
      session.interests,
      session.constraints,
      nextDetails,
    ),
  }
}

export function updateTripSessionWithClarification(
  session: TripSession,
  answer: string,
  extractedDetails: Partial<TripClarificationDetails> = {},
): TripSession {
  const trimmedAnswer = answer.trim()
  const parsedDetails = parseClarificationDetails(trimmedAnswer, session.destination)
  const nextSession = mergeTripSessionProfile(session, {
    ...parsedDetails,
    ...extractedDetails,
  })

  return {
    ...nextSession,
    userInput: trimmedAnswer ? session.userInput + '\n' + trimmedAnswer : session.userInput,
  }
}
