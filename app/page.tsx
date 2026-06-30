'use client'

import { useState, useEffect } from 'react'
import HeroInput from '@/components/cotrip/HeroInput'
import ClarificationCard from '@/components/cotrip/ClarificationCard'
import LoadingPlanningState from '@/components/cotrip/LoadingPlanningState'
import TripWorkspace from '@/components/cotrip/TripWorkspace'
import ExportPage from '@/components/cotrip/ExportPage'
import { createTripSession, mergeTripSessionProfile } from '@/lib/trip-session'
import type { AppState, TripSession } from '@/lib/types'
import type { TripProfileApiResponse } from '@/lib/trip-profile-api'

export default function Page() {
  const [appState, setAppState] = useState<AppState>('hero')
  const [tripSession, setTripSession] = useState<TripSession>(() => createTripSession('', []))

  // 加载状态自动进入工作台
  useEffect(() => {
    if (appState === 'loading') {
      const timer = setTimeout(() => {
        setAppState('workspace')
      }, 3800)
      return () => clearTimeout(timer)
    }
  }, [appState])

  const handleStart = (input: string, tags: string[]) => {
    const localSession = createTripSession(input, tags)
    setTripSession(localSession)
    setAppState('clarification')

    void fetch('/api/trip-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: localSession, answer: '' }),
    })
      .then(response => {
        if (!response.ok) throw new Error('Trip profile API request failed')
        return response.json() as Promise<TripProfileApiResponse>
      })
      .then(data => {
        setTripSession(prev => mergeTripSessionProfile(prev, data.session.clarificationDetails))
      })
      .catch(() => {
        // Keep the local parser result when the AI API is not configured or unavailable.
      })
  }

  const handleGenerate = () => {
    setAppState('loading')
  }

  const handlePlansChange = (plans: TripSession['plans']) => {
    setTripSession(prev => ({ ...prev, plans }))
  }

  return (
    <div className="page-transition">
      {appState === 'hero' && (
        <HeroInput onStart={handleStart} />
      )}

      {appState === 'clarification' && (
        <ClarificationCard
          session={tripSession}
          onSessionUpdate={setTripSession}
          onGenerate={handleGenerate}
        />
      )}

      {appState === 'loading' && (
        <LoadingPlanningState session={tripSession} />
      )}

      {appState === 'workspace' && (
        <TripWorkspace
          session={tripSession}
          onPlansChange={handlePlansChange}
          onExport={() => setAppState('export')}
        />
      )}

      {appState === 'export' && (
        <ExportPage
          session={tripSession}
          plans={tripSession.plans}
          onBack={() => setAppState('workspace')}
        />
      )}
    </div>
  )
}