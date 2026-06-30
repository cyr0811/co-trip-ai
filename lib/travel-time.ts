import type { CandidatePlace } from './types'

export interface TravelTimeEdge {
  fromPlaceId: string
  toPlaceId: string
  fromName: string
  toName: string
  mode: 'transit'
  durationMinutes: number
  distanceKm: number
  source: 'mock'
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function pairKey(a: string, b: string) {
  return [normalizeName(a), normalizeName(b)].sort().join('__')
}

const knownTokyoTransitMinutes: Record<string, number> = {
  [pairKey('浅草', '上野')]: 12,
  [pairKey('浅草寺', '上野公园')]: 16,
  [pairKey('上野', '原宿')]: 35,
  [pairKey('上野公园', '原宿')]: 38,
  [pairKey('原宿', '表参道')]: 6,
  [pairKey('表参道', '涩谷')]: 8,
  [pairKey('涩谷', '代官山')]: 6,
  [pairKey('涩谷 Sky', '代官山')]: 9,
  [pairKey('银座', '筑地')]: 8,
  [pairKey('筑地', '台场')]: 32,
  [pairKey('银座', '台场')]: 26,
  [pairKey('东京塔', '银座')]: 18,
  [pairKey('浅草', '银座')]: 25,
  [pairKey('台场', '代官山')]: 42,
  [pairKey('迪士尼', '东京')]: 55,
}

function distanceKm(a: CandidatePlace, b: CandidatePlace) {
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lat !== 'number' || typeof b.lng !== 'number') return 0
  const latKm = (a.lat - b.lat) * 111
  const lngKm = (a.lng - b.lng) * 88
  return Math.sqrt(latKm * latKm + lngKm * lngKm)
}

function estimateDurationFromDistance(km: number) {
  if (km <= 0) return 25
  if (km <= 1.5) return Math.round(8 + km * 5)
  if (km <= 5) return Math.round(12 + km * 5.5)
  if (km <= 12) return Math.round(20 + km * 4)
  return Math.round(Math.min(120, 35 + km * 3.2))
}

export function estimateTravelTime(from: CandidatePlace, to: CandidatePlace): TravelTimeEdge {
  const known = knownTokyoTransitMinutes[pairKey(from.name, to.name)]
  const distance = distanceKm(from, to)
  const durationMinutes = known || estimateDurationFromDistance(distance)

  return {
    fromPlaceId: from.id,
    toPlaceId: to.id,
    fromName: from.name,
    toName: to.name,
    mode: 'transit',
    durationMinutes,
    distanceKm: Number(distance.toFixed(1)),
    source: 'mock',
  }
}

export function createTravelMatrix(places: CandidatePlace[]) {
  const edges: TravelTimeEdge[] = []

  places.forEach((from, fromIndex) => {
    places.slice(fromIndex + 1).forEach(to => {
      edges.push(estimateTravelTime(from, to))
    })
  })

  return edges
}

export function getTravelMinutes(matrix: TravelTimeEdge[], from: CandidatePlace, to: CandidatePlace) {
  return matrix.find(edge =>
    (edge.fromPlaceId === from.id && edge.toPlaceId === to.id) ||
    (edge.fromPlaceId === to.id && edge.toPlaceId === from.id)
  )?.durationMinutes || estimateTravelTime(from, to).durationMinutes
}

export function createTravelLegs(matrix: TravelTimeEdge[], places: CandidatePlace[]) {
  return places.slice(0, -1).map((place, index) => {
    const next = places[index + 1]
    const duration = getTravelMinutes(matrix, place, next)
    return {
      from: place.name,
      to: next.name,
      durationMinutes: duration,
      label: `${place.name} → ${next.name} 约 ${duration} 分钟`,
    }
  })
}

export function summarizeTravelDuration(matrix: TravelTimeEdge[], places: CandidatePlace[]) {
  const total = places.slice(0, -1).reduce((sum, place, index) => sum + getTravelMinutes(matrix, place, places[index + 1]), 0)
  if (total <= 0) return '约 20-35 分钟'
  return `约 ${Math.max(10, total - 8)}-${total + 8} 分钟`
}
