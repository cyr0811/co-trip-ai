'use client'

import { useEffect, useRef } from 'react'
import type { MapData, MapDay, MapPoint } from '@/lib/map-adapter'

interface LeafletRouteMapProps {
  mapData: MapData
  activeDay: MapDay
  color: string
}

function hasLatLng(point: MapPoint) {
  return typeof point.lat === 'number' && typeof point.lng === 'number'
}

function createMarkerHtml(point: MapPoint, index: number, color: string) {
  const statusClass = point.geocodeStatus === 'resolved'
    ? 'resolved'
    : point.geocodeStatus === 'ambiguous'
      ? 'ambiguous'
      : point.geocodeStatus === 'failed'
        ? 'failed'
        : 'pending'

  return `
    <div class="cotrip-leaflet-marker ${statusClass}" style="--marker-color: ${color}">
      <span>${index + 1}</span>
    </div>
  `
}

function escapeHtml(value?: string) {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function createPopupHtml(point: MapPoint) {
  const time = point.startTime
    ? `<br /><span>${escapeHtml(point.startTime)}${point.endTime ? ` - ${escapeHtml(point.endTime)}` : ''}</span>`
    : ''
  const address = point.address ? `<br /><span>${escapeHtml(point.address)}</span>` : ''
  const links = [
    point.navigationUrl ? `<a href="${escapeHtml(point.navigationUrl)}" target="_blank" rel="noreferrer">导航</a>` : '',
    point.xhsUrl ? `<a href="${escapeHtml(point.xhsUrl)}" target="_blank" rel="noreferrer">小红书</a>` : '',
    point.dianpingUrl ? `<a href="${escapeHtml(point.dianpingUrl)}" target="_blank" rel="noreferrer">大众点评</a>` : '',
  ].filter(Boolean)

  return `
    <strong>${escapeHtml(point.name)}</strong>
    ${address}
    ${time}
    ${links.length > 0 ? `<br /><span class="cotrip-popup-links">${links.join(' · ')}</span>` : ''}
  `
}

export default function LeafletRouteMap({ mapData, activeDay, color }: LeafletRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)

  useEffect(() => {
    let disposed = false

    async function renderMap() {
      if (!containerRef.current) return
      const L = await import('leaflet')
      if (disposed || !containerRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
        })

        L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current)
        L.control.attribution({ prefix: false }).addTo(mapRef.current)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(mapRef.current)
      }

      const map = mapRef.current
      map.eachLayer(layer => {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer)
      })

      const activePoints = activeDay.points.filter(hasLatLng)
      const hotelPoint = mapData.hotel && hasLatLng(mapData.hotel) ? mapData.hotel : undefined
      const allVisiblePoints = [...(hotelPoint ? [hotelPoint] : []), ...activePoints]

      if (activePoints.length > 1) {
        L.polyline(activePoints.map(point => [point.lat as number, point.lng as number]), {
          color,
          weight: 4,
          opacity: 0.76,
          dashArray: '8 8',
        }).addTo(map)
      }

      activePoints.forEach((point, index) => {
        const marker = L.marker([point.lat as number, point.lng as number], {
          icon: L.divIcon({
            className: 'cotrip-leaflet-icon',
            html: createMarkerHtml(point, index, color),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -12],
          }),
        })
        marker.bindPopup(createPopupHtml(point))
        marker.addTo(map)
      })

      if (hotelPoint) {
        L.marker([hotelPoint.lat as number, hotelPoint.lng as number], {
          icon: L.divIcon({
            className: 'cotrip-leaflet-icon',
            html: '<div class="cotrip-leaflet-hotel">住</div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -12],
          }),
        }).bindPopup(createPopupHtml(hotelPoint)).addTo(map)
      }

      if (allVisiblePoints.length > 0) {
        const bounds = L.latLngBounds(allVisiblePoints.map(point => [point.lat as number, point.lng as number]))
        map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 })
      } else {
        map.setView([35.681236, 139.767125], 12)
      }
    }

    void renderMap()

    return () => {
      disposed = true
    }
  }, [activeDay, color, mapData])

  useEffect(() => () => {
    mapRef.current?.remove()
    mapRef.current = null
  }, [])

  return <div ref={containerRef} className="absolute inset-0 z-0" />
}
