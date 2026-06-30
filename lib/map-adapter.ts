import type { DayPlan, ItineraryItem, Place, TripState as LegacyTripState } from './types'
import type { GeocodeStatus, MapProvider, TimeSlot as MapTimeSlot, TripItem, TripItemType, TripState as MapTripState } from './types/trip'
import { buildExternalSearchLinks } from './external-search'
import { resolveMockCoordinate } from './mock-geocode'

export interface MapPoint {
  id: string
  dayIndex: number
  name: string
  type: string
  x: number
  y: number
  lat: number | null
  lng: number | null
  address?: string
  description?: string
  reason?: string
  timeSlot?: string
  startTime?: string
  endTime?: string
  geocodeStatus?: GeocodeStatus
  mapProvider?: MapProvider
  placeId?: string
  amapPoiId?: string
  xhsKeyword?: string
  xhsUrl?: string
  dianpingKeyword?: string
  dianpingUrl?: string
  navigationUrl?: string
}

export interface MapDay {
  dayIndex: number
  title: string
  summary?: string
  mainArea?: string
  estimatedTransport?: string
  intensity?: string
  points: MapPoint[]
}

export interface MapData {
  destination?: string
  selectedDayIndex: number
  selectedItemId?: string
  days: MapDay[]
  allPoints: MapPoint[]
  hotel?: MapPoint
}

interface GeoBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const canvasPadding = 10
const fallbackCenter = { x: 50, y: 50 }

function createGeoBounds(items: TripItem[]): GeoBounds | null {
  const geocodedItems = items.filter(item => typeof item.lat === 'number' && typeof item.lng === 'number')
  if (geocodedItems.length === 0) return null

  const lats = geocodedItems.map(item => item.lat as number)
  const lngs = geocodedItems.map(item => item.lng as number)
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }
}

function projectGeoPoint(item: TripItem, bounds: GeoBounds | null, fallbackIndex: number): Pick<MapPoint, 'x' | 'y'> {
  if (!bounds || typeof item.lat !== 'number' || typeof item.lng !== 'number') {
    return {
      x: fallbackCenter.x + fallbackIndex * 3,
      y: fallbackCenter.y + fallbackIndex * 3,
    }
  }

  const latRange = bounds.maxLat - bounds.minLat || 0.01
  const lngRange = bounds.maxLng - bounds.minLng || 0.01
  const x = canvasPadding + ((item.lng - bounds.minLng) / lngRange) * (100 - canvasPadding * 2)
  const y = canvasPadding + ((bounds.maxLat - item.lat) / latRange) * (100 - canvasPadding * 2)

  return {
    x: Math.max(canvasPadding, Math.min(100 - canvasPadding, x)),
    y: Math.max(canvasPadding, Math.min(100 - canvasPadding, y)),
  }
}

function mapTripItemToPoint(item: TripItem, bounds: GeoBounds | null, index: number): MapPoint {
  const projected = projectGeoPoint(item, bounds, index)
  return {
    id: item.id,
    dayIndex: item.dayIndex,
    name: item.name,
    type: item.type,
    x: projected.x,
    y: projected.y,
    lat: item.lat,
    lng: item.lng,
    address: item.address,
    description: item.description,
    reason: item.reason,
    timeSlot: item.timeSlot,
    startTime: item.startTime,
    endTime: item.endTime,
    geocodeStatus: item.geocodeStatus,
    mapProvider: item.mapProvider,
    placeId: item.placeId,
    amapPoiId: item.amapPoiId,
    xhsKeyword: item.xhsKeyword,
    xhsUrl: item.xhsUrl,
    dianpingKeyword: item.dianpingKeyword,
    dianpingUrl: item.dianpingUrl,
    navigationUrl: item.navigationUrl,
  }
}

export function createMapDataFromTripState(tripState: MapTripState): MapData {
  const tripItems = tripState.days.flatMap(day => day.items)
  const itemsForProjection = tripState.hotel ? [tripState.hotel, ...tripItems] : tripItems
  const bounds = createGeoBounds(itemsForProjection)
  const projectedItems = new Map(
    tripItems.map((item, index) => [item.id, mapTripItemToPoint(item, bounds, index)])
  )
  const hotel = tripState.hotel
    ? mapTripItemToPoint(tripState.hotel, bounds, tripItems.length)
    : undefined

  const days = tripState.days.map(day => ({
    dayIndex: day.dayIndex,
    title: day.title,
    summary: day.summary,
    mainArea: day.mainArea,
    points: day.items.map(item => projectedItems.get(item.id)).filter((point): point is MapPoint => Boolean(point)),
  }))

  return {
    destination: tripState.destination,
    selectedDayIndex: tripState.selectedDayIndex,
    selectedItemId: tripState.selectedItemId,
    days,
    allPoints: [...(hotel ? [hotel] : []), ...days.flatMap(day => day.points)],
    hotel,
  }
}

export function createMapDataFromDayPlans(plans: DayPlan[], activeDayIndex = 0): MapData {
  const days = plans.map(plan => ({
    dayIndex: plan.day,
    title: plan.title,
    summary: plan.reason,
    estimatedTransport: plan.estimatedTransport,
    intensity: plan.intensity,
    points: plan.places.map(place => ({
      id: place.id,
      dayIndex: plan.day,
      name: place.name,
      type: place.type,
      x: place.x,
      y: place.y,
      lat: null,
      lng: null,
      geocodeStatus: 'pending' as const,
      mapProvider: 'unknown' as const,
    })),
  }))

  return {
    selectedDayIndex: days[activeDayIndex]?.dayIndex || days[0]?.dayIndex || 1,
    days,
    allPoints: days.flatMap(day => day.points),
  }
}

function mapPlaceTypeToTripItemType(type: Place['type']): TripItemType {
  if (type === 'hotel') return 'hotel'
  if (type === 'food') return 'restaurant'
  if (type === 'transport') return 'transport'
  if (type === 'shopping') return 'activity'
  return 'spot'
}

function mapItineraryItemTypeToTripItemType(type: ItineraryItem['type']): TripItemType {
  if (type === 'hotel') return 'hotel'
  if (type === 'restaurant') return 'restaurant'
  if (type === 'cafe') return 'cafe'
  if (type === 'transport') return 'transport'
  if (type === 'rest' || type === 'experience' || type === 'free_time' || type === 'nightlife' || type === 'placeholder') return 'activity'
  return 'spot'
}

function mapPeriodToTimeSlot(period?: string): MapTimeSlot {
  if (period === '上午') return 'morning'
  if (period === '下午') return 'afternoon'
  if (period === '晚上') return 'night'
  if (period === '全天') return 'morning'
  return 'afternoon'
}

function createTripItemFromPlace(place: Place, plan: DayPlan, destination: string, index: number): TripItem {
  const coordinate = resolveMockCoordinate(place.name, destination)
  const type = mapPlaceTypeToTripItemType(place.type)
  const links = buildExternalSearchLinks({
    name: place.name,
    destination,
    type,
    address: coordinate?.address,
    lat: coordinate?.lat,
    lng: coordinate?.lng,
  })
  return {
    id: place.id,
    dayIndex: plan.day,
    name: place.name,
    type,
    timeSlot: index === 0 ? 'morning' : index === 1 ? 'lunch' : index === 2 ? 'afternoon' : 'night',
    address: coordinate?.address,
    lat: coordinate?.lat ?? null,
    lng: coordinate?.lng ?? null,
    description: plan.theme,
    reason: plan.reason,
    status: 'planned',
    placeId: place.id,
    mapProvider: coordinate ? 'osm' : 'unknown',
    geocodeStatus: coordinate ? 'resolved' : 'pending',
    ...links,
  }
}

function createTripItemFromItineraryItem(item: ItineraryItem, plan: DayPlan, destination: string, index: number): TripItem {
  const coordinate = resolveMockCoordinate(item.place || item.title, destination)
  const type = mapItineraryItemTypeToTripItemType(item.type)
  const name = item.place || item.title
  const links = buildExternalSearchLinks({
    name,
    destination,
    type,
    address: item.area || coordinate?.address,
    lat: coordinate?.lat,
    lng: coordinate?.lng,
  })
  return {
    id: item.id,
    dayIndex: plan.day,
    name,
    type,
    timeSlot: mapPeriodToTimeSlot(item.timeLabel) || (index === 0 ? 'morning' : 'afternoon'),
    address: item.area || coordinate?.address,
    lat: coordinate?.lat ?? null,
    lng: coordinate?.lng ?? null,
    description: item.note,
    reason: plan.reason,
    status: item.status === 'locked' ? 'confirmed' : item.status === 'needs_api' ? 'candidate' : 'planned',
    placeId: item.place,
    mapProvider: item.source === 'map_api' ? 'osm' : coordinate ? 'osm' : 'unknown',
    geocodeStatus: item.source === 'map_api' || coordinate ? 'resolved' : 'pending',
    ...links,
  }
}

function uniqueTripItems(items: TripItem[]) {
  const itemMap = new Map<string, TripItem>()
  items.forEach(item => {
    const key = `${item.dayIndex}-${item.name}`
    if (!itemMap.has(key)) itemMap.set(key, item)
  })
  return Array.from(itemMap.values())
}

export function createMapTripStateFromLegacyTripState(
  tripState: LegacyTripState,
  selectedDayIndex = 1,
  selectedItemId?: string,
): MapTripState {
  const hotelCoordinate = resolveMockCoordinate(
    tripState.hotel.name || tripState.hotel.area || tripState.hotel.address || tripState.destination,
    tripState.destination,
  )
  const hotel = tripState.hotel.name || tripState.hotel.address || tripState.hotel.area
    ? {
        id: 'legacy-hotel',
        dayIndex: 0,
        name: tripState.hotel.name || tripState.hotel.area || '住宿地点',
        type: 'hotel' as const,
        timeSlot: 'night' as const,
        address: tripState.hotel.address || hotelCoordinate?.address,
        lat: hotelCoordinate?.lat ?? null,
        lng: hotelCoordinate?.lng ?? null,
        description: tripState.hotel.area,
        status: 'candidate' as const,
        mapProvider: hotelCoordinate ? 'osm' as const : 'unknown' as const,
        geocodeStatus: hotelCoordinate ? 'resolved' as const : 'pending' as const,
        ...buildExternalSearchLinks({
          name: tripState.hotel.name || tripState.hotel.area || '住宿地点',
          destination: tripState.destination,
          type: 'hotel',
          address: tripState.hotel.address || hotelCoordinate?.address,
          lat: hotelCoordinate?.lat,
          lng: hotelCoordinate?.lng,
        }),
      }
    : undefined

  return {
    destination: tripState.destination,
    dates: [],
    hotel,
    days: tripState.itinerary.map(plan => {
      const placeItems = plan.places.map((place, index) => createTripItemFromPlace(place, plan, tripState.destination, index))
      const detailItems = (plan.items || [])
        .filter(item => item.place || item.status === 'needs_api')
        .map((item, index) => createTripItemFromItineraryItem(item, plan, tripState.destination, index))
      return {
        dayIndex: plan.day,
        title: plan.title,
        mainArea: plan.theme,
        summary: plan.reason,
        items: uniqueTripItems([...placeItems, ...detailItems]),
      }
    }),
    selectedDayIndex,
    selectedItemId,
    preferences: tripState.preferences,
    constraints: [
      ...tripState.constraints.avoidPlaces.map(place => `避开地点：${place}`),
      ...tripState.constraints.avoidCategories.map(category => `避开类型：${category}`),
      ...tripState.constraints.notes,
    ],
  }
}
