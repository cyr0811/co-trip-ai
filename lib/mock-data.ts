// CoTrip AI — Mock 数据

import type { ChatMessage, DayPlan } from './types'

export type {
  AppState,
  ChatMessage,
  DayIntensity,
  DayPlan,
  Place,
  TimeSlot,
} from './types'
// 东京 6 日行程 Mock 数据
export const mockItinerary: DayPlan[] = [
  {
    day: 1,
    title: '抵达东京',
    theme: '新宿轻松适应',
    intensity: '轻松',
    slots: [
      {
        period: '下午',
        activities: ['抵达东京', '前往酒店寄存行李', '新宿周边漫步适应城市节奏'],
      },
      {
        period: '晚上',
        activities: ['新宿居酒屋晚餐', '回酒店休息'],
      },
    ],
    reason: '第一天不安排高强度行程，适合在新宿附近走走，感受东京的节奏。',
    estimatedTransport: '约 30 分钟',
    places: [
      { id: 'shinjuku-station', name: '新宿站', type: 'transport', x: 28, y: 48 },
      { id: 'shinjuku-gyoen', name: '新宿御苑', type: 'attraction', x: 32, y: 52 },
      { id: 'shinjuku-dinner', name: '新宿晚餐', type: 'food', x: 26, y: 46 },
    ],
  },
  {
    day: 2,
    title: '浅草 + 上野',
    theme: '经典文化路线',
    intensity: '适中',
    slots: [
      {
        period: '上午',
        activities: ['浅草寺参拜', '仲见世通购物街逛逛', '浅草周边小吃'],
      },
      {
        period: '下午',
        activities: ['上野公园散步', '东京国立博物馆（可选）'],
      },
      {
        period: '晚上',
        activities: ['上野阿美横町觅食', '晚餐'],
      },
    ],
    reason: '浅草和上野位于东京东侧，适合安排在同一天，减少跨区域移动，也是最经典的东京初游体验。',
    estimatedTransport: '约 45 分钟',
    places: [
      { id: 'sensoji', name: '浅草寺', type: 'attraction', x: 68, y: 35 },
      { id: 'nakamise', name: '仲见世通', type: 'shopping', x: 67, y: 36 },
      { id: 'ueno-park', name: '上野公园', type: 'attraction', x: 58, y: 38 },
      { id: 'ueno-museum', name: '东京国立博物馆', type: 'attraction', x: 59, y: 36 },
      { id: 'ameyoko', name: '阿美横町', type: 'shopping', x: 57, y: 40 },
    ],
  },
  {
    day: 3,
    title: '原宿 + 表参道 + 涩谷',
    theme: '城市街区与购物',
    intensity: '适中',
    slots: [
      {
        period: '上午',
        activities: ['原宿竹下通', '表参道高端品牌街区漫步'],
      },
      {
        period: '下午',
        activities: ['涩谷购物（涩谷 Sky、109 等）', '涩谷十字路口打卡'],
      },
      {
        period: '晚上',
        activities: ['涩谷夜景', '涩谷美食晚餐'],
      },
    ],
    reason: '这一日集中在东京西侧，符合购物、街区和拍照偏好，减少跨区域移动。',
    estimatedTransport: '约 35 分钟',
    places: [
      { id: 'harajuku', name: '原宿竹下通', type: 'shopping', x: 22, y: 52 },
      { id: 'omotesando', name: '表参道', type: 'shopping', x: 24, y: 55 },
      { id: 'shibuya-cross', name: '涩谷十字路口', type: 'attraction', x: 20, y: 58 },
      { id: 'shibuya-sky', name: '涩谷 Sky', type: 'attraction', x: 19, y: 59 },
    ],
  },
  {
    day: 4,
    title: '筑地 + 银座 + 东京塔',
    theme: '美食、购物与夜景',
    intensity: '适中',
    slots: [
      {
        period: '上午',
        activities: ['筑地场外市场', '新鲜海鲜早午餐', '场内参观（可选）'],
      },
      {
        period: '下午',
        activities: ['银座购物（旗舰店、百货）', '银座咖啡下午茶'],
      },
      {
        period: '晚上',
        activities: ['东京塔夜景', '增上寺（塔旁）打卡', '附近晚餐'],
      },
    ],
    reason: '美食、购物和夜景的经典组合，适合第一次去东京的完整体验，区域连贯、交通方便。',
    estimatedTransport: '约 50 分钟',
    places: [
      { id: 'tsukiji', name: '筑地市场', type: 'food', x: 48, y: 60 },
      { id: 'ginza', name: '银座', type: 'shopping', x: 50, y: 58 },
      { id: 'tokyo-tower', name: '东京塔', type: 'attraction', x: 42, y: 62 },
    ],
  },
  {
    day: 5,
    title: '东京迪士尼',
    theme: '主题乐园全天',
    intensity: '较满',
    slots: [
      {
        period: '全天',
        activities: ['东京迪士尼乐园 或 迪士尼海洋', '园区内餐厅午餐', '傍晚夜间游行'],
      },
      {
        period: '晚上',
        activities: ['返回酒店休息'],
      },
    ],
    reason: '主题乐园通常需要单独安排一天，建议提前购票，避免与其他景点强行组合导致体验打折。',
    estimatedTransport: '约 60 分钟（往返）',
    places: [
      { id: 'disney', name: '东京迪士尼', type: 'attraction', x: 88, y: 55 },
    ],
  },
  {
    day: 6,
    title: '代官山 / 清澄白河',
    theme: '轻松收尾',
    intensity: '轻松',
    slots: [
      {
        period: '上午',
        activities: ['代官山咖啡街区漫步', '茑屋书店（代官山 T-Site）'],
      },
      {
        period: '下午',
        activities: ['购买伴手礼', '最后一次逛逛喜欢的区域'],
      },
      {
        period: '晚上',
        activities: ['返程或自由活动'],
      },
    ],
    reason: '最后一天保留弹性时间，避免影响返程，代官山街区适合放松漫步。',
    estimatedTransport: '约 25 分钟',
    places: [
      { id: 'daikanyama', name: '代官山', type: 'attraction', x: 18, y: 62 },
      { id: 'tsutaya', name: '茑屋书店', type: 'shopping', x: 19, y: 63 },
      { id: 'kiyosumi', name: '清澄白河', type: 'attraction', x: 62, y: 58 },
    ],
  },
]

// Day 3 修改后版本
export const day3Updated: DayPlan = {
  day: 3,
  title: '原宿 + 表参道 + 涩谷',
  theme: '轻松版城市街区',
  intensity: '轻松',
  slots: [
    {
      period: '上午',
      activities: ['原宿竹下通随意逛逛', '表参道咖啡休息'],
    },
    {
      period: '下午',
      activities: ['涩谷街区漫步', '涩谷十字路口打卡', '自由购物时间'],
    },
    {
      period: '晚上',
      activities: ['涩谷轻松晚餐'],
    },
  ],
  reason: '已将地点从 4 个减少为 3 个，去掉明治神宫，集中在原宿 → 表参道 → 涩谷，更符合你希望轻松一点的节奏。',
  estimatedTransport: '约 20 分钟',
  places: [
    { id: 'harajuku', name: '原宿竹下通', type: 'shopping', x: 22, y: 52 },
    { id: 'omotesando', name: '表参道', type: 'shopping', x: 24, y: 55 },
    { id: 'shibuya-cross', name: '涩谷十字路口', type: 'attraction', x: 20, y: 58 },
  ],
}

// 初始 AI 对话消息
export const initialMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'ai',
    content: '我已经根据你的偏好生成了一版东京 6 日轻松自由行。整体会尽量减少跨区域移动，每天保留休息时间，并兼顾美食、购物和城市街区体验。',
    timestamp: '刚刚',
  },
]

// 加载文案序列
export const loadingTexts = [
  '正在理解你的旅行偏好……',
  '正在根据东京区域关系规划路线……',
  '正在检查每日行程强度……',
  '正在生成可修改的初版行程……',
]

// 快捷偏好标签
export const preferenceTags = [
  { id: 'relaxed', label: '轻松一点', icon: '🌿' },
  { id: 'food', label: '美食优先', icon: '🍜' },
  { id: 'walk-less', label: '少走路', icon: '🚌' },
  { id: 'classic', label: '经典路线', icon: '📍' },
  { id: 'photo', label: '适合拍照', icon: '📷' },
  { id: 'budget', label: '预算有限', icon: '💰' },
]

// 示例 Prompt
export const examplePrompts = [
  '第一次去东京，玩 6 天，想轻松一点',
  '第一次去成都，周末 3 天，想吃美食',
  '第一次去大阪，预算有限，想经典但不太累',
]

// 每日颜色配置
export const dayColors: Record<number, { bg: string; text: string; dot: string; line: string }> = {
  1: { bg: 'bg-sky-100', text: 'text-sky-700', dot: '#3b82f6', line: '#93c5fd' },
  2: { bg: 'bg-mint-100', text: 'text-emerald-700', dot: '#10b981', line: '#6ee7b7' },
  3: { bg: 'bg-peach-100', text: 'text-orange-700', dot: '#f97316', line: '#fdba74' },
  4: { bg: 'bg-violet-100', text: 'text-violet-700', dot: '#8b5cf6', line: '#c4b5fd' },
  5: { bg: 'bg-rose-100', text: 'text-rose-700', dot: '#f43f5e', line: '#fda4af' },
  6: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#f59e0b', line: '#fcd34d' },
}
