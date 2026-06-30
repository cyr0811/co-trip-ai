import type { TripItemType } from './types/trip'

interface ExternalSearchInput {
  name: string
  destination?: string
  type?: TripItemType | string
  address?: string
  lat?: number | null
  lng?: number | null
  xhsKeyword?: string
  dianpingKeyword?: string
}

export interface ExternalSearchLinks {
  xhsKeyword: string
  xhsUrl: string
  dianpingKeyword: string
  dianpingUrl: string
  navigationUrl: string
}

function compactText(value?: string) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function buildBaseKeyword(name: string, destination?: string) {
  return compactText([destination, name].filter(Boolean).join(' '))
}

function buildXhsKeyword(input: ExternalSearchInput) {
  if (input.xhsKeyword) return compactText(input.xhsKeyword)
  const base = buildBaseKeyword(input.name, input.destination)
  if (input.type === 'restaurant') return `${base} 餐厅 推荐`
  if (input.type === 'cafe') return `${base} 咖啡`
  if (input.type === 'hotel') return `${base} 酒店`
  return `${base} 攻略`
}

function buildDianpingKeyword(input: ExternalSearchInput) {
  if (input.dianpingKeyword) return compactText(input.dianpingKeyword)
  const base = buildBaseKeyword(input.name, input.destination)
  if (input.type === 'restaurant') return `${base} 美食`
  if (input.type === 'cafe') return `${base} 咖啡`
  if (input.type === 'hotel') return `${base} 酒店`
  return `${base} 附近美食`
}

function buildNavigationQuery(input: ExternalSearchInput) {
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return `${input.lat},${input.lng}`
  }
  return compactText([input.name, input.address, input.destination].filter(Boolean).join(' '))
}

export function buildExternalSearchLinks(input: ExternalSearchInput): ExternalSearchLinks {
  const xhsKeyword = buildXhsKeyword(input)
  const dianpingKeyword = buildDianpingKeyword(input)
  const navigationQuery = buildNavigationQuery(input)

  return {
    xhsKeyword,
    xhsUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(xhsKeyword)}&source=web_explore_feed`,
    dianpingKeyword,
    dianpingUrl: `https://m.dianping.com/searchshop?keyword=${encodeURIComponent(dianpingKeyword)}`,
    navigationUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationQuery)}`,
  }
}
