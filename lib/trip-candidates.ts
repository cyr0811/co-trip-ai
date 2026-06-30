import type {
  CandidateConstraintTag,
  CandidatePlace,
  CandidatePlacePriority,
  CandidatePlaceType,
  DayIntensity,
  PlanningConstraints,
} from './types'
import { resolveMockCoordinate } from './mock-geocode'

interface KnownPlaceDefinition {
  name: string
  type: CandidatePlaceType
  tags?: CandidateConstraintTag[]
  areaHint?: string
}

const commonPlaceCatalog: KnownPlaceDefinition[] = [
  { name: '迪士尼', type: 'spot', tags: ['far_suburb', 'reservation_required', 'crowded_on_holiday'] },
  { name: '环球影城', type: 'spot', tags: ['far_suburb', 'reservation_required', 'crowded_on_holiday'] },
  { name: '富士山', type: 'spot', tags: ['far_suburb', 'weather_sensitive'] },
  { name: '箱根', type: 'area', tags: ['far_suburb', 'weather_sensitive'] },
  { name: '咖啡', type: 'cafe', tags: ['meal_candidate'] },
  { name: '咖啡店', type: 'cafe', tags: ['meal_candidate'] },
  { name: '拉面', type: 'restaurant', tags: ['meal_candidate'] },
  { name: '居酒屋', type: 'restaurant', tags: ['meal_candidate'] },
  { name: '甜品', type: 'restaurant', tags: ['meal_candidate'] },
  { name: '夜景', type: 'spot', tags: ['weather_sensitive'] },
]

const cityPlaceCatalog: Record<string, KnownPlaceDefinition[]> = {
  东京: [
    { name: '浅草寺', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday'], areaHint: '浅草' },
    { name: '浅草', type: 'area', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '仲见世通', type: 'shopping', tags: ['pass_through', 'crowded_on_holiday'], areaHint: '浅草' },
    { name: '上野公园', type: 'spot', tags: ['classic_anchor', 'weather_sensitive'], areaHint: '上野' },
    { name: '上野', type: 'area', tags: ['classic_anchor'] },
    { name: '东京国立博物馆', type: 'spot', tags: ['reservation_required'], areaHint: '上野' },
    { name: '原宿', type: 'area', tags: ['pass_through'] },
    { name: '竹下通', type: 'shopping', tags: ['crowded_on_holiday'], areaHint: '原宿' },
    { name: '表参道', type: 'area', tags: ['pass_through'] },
    { name: '涩谷 Sky', type: 'spot', tags: ['reservation_required', 'weather_sensitive'], areaHint: '涩谷' },
    { name: '涩谷Sky', type: 'spot', tags: ['reservation_required', 'weather_sensitive'], areaHint: '涩谷' },
    { name: '涩谷', type: 'area', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '银座', type: 'area', tags: ['pass_through'] },
    { name: '筑地', type: 'area', tags: ['meal_candidate', 'crowded_on_holiday'] },
    { name: '东京塔', type: 'spot', tags: ['classic_anchor', 'weather_sensitive'] },
    { name: '台场', type: 'area', tags: ['weather_sensitive'] },
    { name: '代官山', type: 'area', tags: ['pass_through'] },
    { name: '清澄白河', type: 'area', tags: ['pass_through'] },
    { name: '东京迪士尼', type: 'spot', tags: ['far_suburb', 'reservation_required', 'crowded_on_holiday'] },
  ],
  成都: [
    { name: '太古里', type: 'area', tags: ['pass_through', 'crowded_on_holiday'] },
    { name: '春熙路', type: 'area', tags: ['pass_through', 'crowded_on_holiday'] },
    { name: '宽窄巷子', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '锦里', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '武侯祠', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '人民公园', type: 'spot', tags: ['classic_anchor', 'weather_sensitive'] },
    { name: '熊猫基地', type: 'spot', tags: ['reservation_required', 'crowded_on_holiday'] },
    { name: '杜甫草堂', type: 'spot', tags: ['classic_anchor', 'weather_sensitive'] },
    { name: '九眼桥', type: 'area', tags: ['pass_through'] },
  ],
  大阪: [
    { name: '难波', type: 'area', tags: ['classic_anchor', 'crowded_on_holiday'] },
    { name: '心斋桥', type: 'area', tags: ['pass_through', 'crowded_on_holiday'] },
    { name: '道顿堀', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday', 'meal_candidate'] },
    { name: '梅田', type: 'area', tags: ['pass_through'] },
    { name: '大阪城', type: 'spot', tags: ['classic_anchor', 'weather_sensitive'] },
    { name: '环球影城', type: 'spot', tags: ['far_suburb', 'reservation_required', 'crowded_on_holiday'] },
  ],
  京都: [
    { name: '清水寺', type: 'spot', tags: ['classic_anchor', 'crowded_on_holiday', 'weather_sensitive'] },
    { name: '祇园', type: 'area', tags: ['classic_anchor', 'pass_through'] },
    { name: '岚山', type: 'area', tags: ['weather_sensitive', 'crowded_on_holiday'] },
    { name: '伏见稻荷', type: 'spot', tags: ['classic_anchor', 'weather_sensitive', 'crowded_on_holiday'] },
    { name: '锦市场', type: 'spot', tags: ['meal_candidate', 'crowded_on_holiday'] },
  ],
}

const fallbackStopWords = new Set([
  '第一次',
  '自由行',
  '攻略',
  '截图',
  '路线',
  '行程',
  '景点',
  '区域',
  '餐厅',
  '预算',
  '交通',
  '周末',
  '每天',
  '开始',
  '出行',
  '硬约束',
  '住宿',
  '酒店',
  '位于',
  '附近',
  '左右',
  '预算',
  '轻松',
  '一点',
  '想轻松一点',
])

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function createId(name: string, index: number) {
  return `candidate-${name}-${index}`.replace(/\s+/g, '-').toLowerCase()
}

function uniqueTags(tags: CandidateConstraintTag[]) {
  return Array.from(new Set(tags))
}

function inferPriority(input: string, name: string, type: CandidatePlaceType): CandidatePlacePriority {
  if (type === 'restaurant' || type === 'cafe') return 'food_preference'

  const nameIndex = input.indexOf(name)
  const context = nameIndex >= 0 ? input.slice(Math.max(0, nameIndex - 12), nameIndex + name.length + 12) : input

  if (/一定要|必须|必去|很想|想去|想打卡|想逛|想看/.test(context)) return 'must_go'
  if (/可以|顺路|有空|备选|如果来得及/.test(context)) return 'optional'
  return 'nice_to_have'
}

function inferExtraTags(name: string, type: CandidatePlaceType): CandidateConstraintTag[] {
  const tags: CandidateConstraintTag[] = []
  if (type === 'restaurant' || type === 'cafe') tags.push('meal_candidate')
  if (/公园|山|湖|海|塔|夜景|河|外滩|西湖/.test(name)) tags.push('weather_sensitive')
  if (/Sky|塔|博物馆|美术馆|乐园|演出|展/.test(name)) tags.push('reservation_required')
  if (/迪士尼|环球|箱根|富士|机场|远郊/.test(name)) tags.push('far_suburb')
  if (/寺|神社|故宫|浅草|道顿堀|清水寺|宽窄|锦里/.test(name)) tags.push('crowded_on_holiday')
  return tags
}

function isNonPlacePhrase(value: string) {
  if (fallbackStopWords.has(value)) return true
  if (/^\d+\s*(天|日|晚)$/.test(value)) return true
  if (/^\d+(?:\.\d+)?\s*(w|W|万|千|k|K|元|块)?(?:左右|以内|上下)?$/.test(value)) return true
  if (/^\d{1,2}\s*(点|:|：)/.test(value)) return true
  if (/^\d{1,2}\s*月/.test(value)) return true
  if (/预算|每天|出行|开始|住在|住宿|酒店|位于|自由行|轻松|不赶|少走|第一次|第.+次|玩\s*\d/.test(value)) return true
  if (/^(想|希望|打算|计划|准备)?轻松一点$/.test(value)) return true
  return false
}

function isLikelyPlacePhrase(value: string) {
  if (isNonPlacePhrase(value)) return false
  if (/寺|神社|公园|博物馆|美术馆|塔|Sky|市场|街|路|里|町|城|宫|乐园|影城|基地|草堂|巷子|桥|山|湖|河|海|咖啡|餐|饭|拉面|寿司|火锅|甜品|居酒屋|商场|购物|夜景/.test(value)) return true
  return value.length >= 2 && value.length <= 8 && !/[0-9]/.test(value)
}

function extractWishlistScope(input: string) {
  const match = input.match(/(?:想去|想逛|想吃|想看|想打卡|一定要去|必去|可以去|还想去|还有|包括|列出来|清单(?:有|是)?)(.+)/)
  return match?.[1] || ''
}

function buildCandidate(
  definition: KnownPlaceDefinition,
  input: string,
  destination: string,
  index: number,
): CandidatePlace {
  const tags = uniqueTags([...(definition.tags || []), ...inferExtraTags(definition.name, definition.type)])
  const coordinate = resolveMockCoordinate(definition.name, destination)
  const isFarSuburb = tags.includes('far_suburb')
  return {
    id: createId(definition.name, index),
    name: definition.name,
    type: definition.type,
    source: 'user_text',
    priority: inferPriority(input, definition.name, definition.type),
    constraintTags: tags,
    status: isFarSuburb ? 'backup' : coordinate ? 'resolved' : 'pending_geocode',
    lat: coordinate?.lat,
    lng: coordinate?.lng,
    address: coordinate?.address,
    rawText: input,
    areaHint: definition.areaHint || (definition.type === 'area' ? definition.name : destination),
    ...(isFarSuburb ? { excludeReason: '距离主城区较远，通常需要单独安排或作为备选。' } : {}),
  }
}

function extractFallbackNames(input: string, destination: string) {
  const scopedInput = extractWishlistScope(input)
  if (!scopedInput) return []

  const segments = scopedInput
    .split(/[，,。；;、\n]/)
    .map(segment => normalizeText(segment))
    .filter(Boolean)

  return segments
    .flatMap(segment => segment.split(/和|以及|还有|想去|想逛|想吃|想看|打卡|去/).map(item => normalizeText(item)))
    .map(item => item.replace(/^(?:我|还|也|都|比较|主要|希望|计划|准备|安排)/, '').trim())
    .map(item => item.replace(/(?:附近|周边|一带|区域|路线|攻略|截图).*$/, '').trim())
    .filter(item => item.length >= 2 && item.length <= 12)
    .filter(item => item !== destination && !fallbackStopWords.has(item))
    .filter(isLikelyPlacePhrase)
    .slice(0, 8)
}

function fallbackType(name: string): CandidatePlaceType {
  if (/咖啡|茶|饮品/.test(name)) return 'cafe'
  if (/餐|饭|拉面|寿司|火锅|小吃|甜品|居酒屋|美食/.test(name)) return 'restaurant'
  if (/商场|购物|街|市场|中古|买/.test(name)) return 'shopping'
  if (/区|町|路|里|街$/.test(name)) return 'area'
  return 'spot'
}

export function extractCandidatePlaces(input: string, destination: string): CandidatePlace[] {
  const normalizedInput = normalizeText(input)
  const catalog = [...(cityPlaceCatalog[destination] || []), ...commonPlaceCatalog]
    .sort((a, b) => b.name.length - a.name.length)
  const candidates: CandidatePlace[] = []
  const seen = new Set<string>()

  catalog.forEach(definition => {
    if (!normalizedInput.includes(definition.name) || seen.has(definition.name)) return
    const hasSpecificChild = Array.from(seen).some(name => name.includes(definition.name) && name !== definition.name)
    if (hasSpecificChild) return
    seen.add(definition.name)
    candidates.push(buildCandidate(definition, normalizedInput, destination, candidates.length))
  })

  extractFallbackNames(normalizedInput, destination).forEach(name => {
    if (seen.has(name)) return
    const type = fallbackType(name)
    const tags = inferExtraTags(name, type)
    const coordinate = resolveMockCoordinate(name, destination)
    const isFarSuburb = tags.includes('far_suburb')
    seen.add(name)
    candidates.push({
      id: createId(name, candidates.length),
      name,
      type,
      source: 'user_text',
      priority: inferPriority(normalizedInput, name, type),
      constraintTags: tags,
      status: isFarSuburb ? 'backup' : coordinate ? 'resolved' : 'pending_geocode',
      lat: coordinate?.lat,
      lng: coordinate?.lng,
      address: coordinate?.address,
      rawText: normalizedInput,
      areaHint: destination,
      ...(isFarSuburb ? { excludeReason: '距离主城区较远，建议先作为备选。' } : {}),
    })
  })

  return candidates
    .sort((a, b) => normalizedInput.indexOf(a.name) - normalizedInput.indexOf(b.name))
    .slice(0, 16)
}

export function buildPlanningConstraints(
  input: string,
  destination: string,
  days: number,
  pace: DayIntensity,
  interests: string[],
  constraints: string[],
): PlanningConstraints {
  const hard = [
    `${destination} ${days} 天`,
    '以住宿位置作为每日路线出发参考',
    '第一天默认降低强度',
    '最后一天保留返程弹性',
  ]

  const preferences = [
    `旅行节奏：${pace}`,
    ...interests.map(interest => `偏好：${interest}`),
  ]

  const avoid = [
    ...constraints,
    ...(/不想|不要|避开|少走|不赶/.test(input) ? ['优先避开用户明确排斥的地点或类型'] : []),
  ]

  const routing = [
    '一天一个主区域',
    '餐厅优先按当天区域顺路补充',
    '远郊点优先单独成天或作为备选',
    '需要预约/天气敏感地点先打标签再排入行程',
  ]

  return { hard, preferences, avoid, routing }
}
