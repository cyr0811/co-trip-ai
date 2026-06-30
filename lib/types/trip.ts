export type TripItemType =
  | 'hotel'
  | 'spot'
  | 'restaurant'
  | 'cafe'
  | 'transport'
  | 'activity'

export type TimeSlot =
  | 'morning'
  | 'lunch'
  | 'afternoon'
  | 'dinner'
  | 'night'

export type GeocodeStatus =
  | 'pending'
  | 'resolved'
  | 'failed'
  | 'ambiguous'

export type MapProvider =
  | 'amap'
  | 'leaflet'
  | 'osm'
  | 'mock'
  | 'manual'
  | 'unknown'

export type TripItemStatus =
  | 'planned'
  | 'confirmed'
  | 'candidate'
  | 'removed'

export interface TripItem {
  id: string
  dayIndex: number
  name: string
  type: TripItemType
  timeSlot: TimeSlot
  startTime?: string
  endTime?: string
  address?: string
  lat: number | null
  lng: number | null
  description?: string
  reason?: string
  status: TripItemStatus
  placeId?: string
  amapPoiId?: string
  mapProvider: MapProvider
  geocodeStatus: GeocodeStatus
  xhsKeyword?: string
  xhsUrl?: string
  dianpingKeyword?: string
  dianpingUrl?: string
  navigationUrl?: string
}

export interface TripDay {
  dayIndex: number
  date?: string
  title: string
  mainArea?: string
  summary?: string
  items: TripItem[]
}

export interface TripState {
  destination: string
  dates: string[]
  hotel?: TripItem
  days: TripDay[]
  selectedDayIndex: number
  selectedItemId?: string
  preferences: string[]
  constraints: string[]
}
