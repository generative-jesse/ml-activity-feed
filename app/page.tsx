'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import FeedSetup from '@/components/FeedSetup'
import LiveMonitor from '@/components/LiveMonitor'
import AIInsights from '@/components/AIInsights'
import MLTemplates from '@/components/MLTemplates'
import ScriptOutput from '@/components/ScriptOutput'
import { getApiKeys, getRecentUrls, addRecentUrl, getSessionRecords, saveSessionRecords } from '@/lib/session'
import type { AppState, FeedConfig, FeedRecord, TemplateType } from '@/types'

const DEFAULT_CONFIG: FeedConfig = {
  url: '',
  pollInterval: 30,
  headers: {},
  maxRecords: 1000,
}

const INITIAL_STATE: AppState = {
  feedConfig: DEFAULT_CONFIG,
  status: 'idle',
  records: [],
  analysis: null,
  isAnalyzing: false,
  selectedTemplate: null,
  generatedScript: null,
  isGenerating: false,
  error: null,
  viewMode: 'table',
}

// Extract array of records from arbitrary API response
function extractRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of ['items', 'data', 'results', 'records', 'entries', 'events', 'list', 'trades', 'orders']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[]
    }
    // Return array of values that are themselves arrays
    const arrVals = Object.values(obj).filter(Array.isArray)
    if (arrVals.length > 0) return arrVals[0] as unknown[]
    // Return the object itself as a single-item array
    return [data]
  }
  return []
}

function dedupeRecords(existing: FeedRecord[], incoming: FeedRecord[]): FeedRecord[] {
  const fingerprints = new Set(existing.map(r => r._id))
  const newOnes = incoming.filter(r => !fingerprints.has(r._id))
  return [...existing, ...newOnes].slice(-1000)
}

function makeId(record: unknown): string {
  try {
    return JSON.stringify(record)
  } catch {
    return Math.random().toString(36)
  }
}

export default function Home() {
  const [state, setState] = useState<AppState>(INITIAL_STATE)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const analysisTriggeredRef = useRef(false)

  // Load session data on mount
  useEffect(() => {
    setRecentUrls(getRecentUrls())
  }, [])

  // Clear poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const fetchFeed = useCallback(async (config: FeedConfig): Promise<FeedRecord[]> => {
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.url, headers: config.headers }),
      })
      const result = await res.json()

      if (!result.ok && result.error) {
        throw new Error(result.error)
      }
      if (!result.isJson) {
        throw new Error(`Response is not JSON (content-type: ${result.contentType})`)
      }

      const raw = extractRecords(result.data)
      const ts = Date.now()
      return raw
        .filter(r => r !== null && typeof r === 'object')
        .map(r => ({
          ...(r as Record<string, unknown>),
          _id: makeId(r),
          _collected_at: ts,
        })) as FeedRecord[]
    } catch (err) {
      throw err instanceof Error ? err : new Error('Fetch failed')
    }
  }, [])

  const analyzeData = useCallback(async (records: FeedRecord[]) => {
    if (analysisTriggeredRef.current) return
    analysisTriggeredRef.current = true

    setState(s => ({ ...s, isAnalyzing: true }))

    try {
      const keys = getApiKeys()
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: records.slice(0, 20),
          apiKey: keys.groq || undefined,
        }),
      })
      const result = await res.json()
      if (result.analysis) {
        setState(s => ({ ...s, analysis: result.analysis, isAnalyzing: false }))
      } else {
        setState(s => ({ ...s, isAnalyzing: false }))
      }
    } catch {
      setState(s => ({ ...s, isAnalyzing: false }))
    }
  }, [])

  const startMonitoring = useCallback(async (config: FeedConfig) => {
    if (pollRef.current) clearInterval(pollRef.current)
    analysisTriggeredRef.current = false

    setState(s => ({
      ...s,
      feedConfig: config,
      status: 'connecting',
      error: null,
      records: [],
      analysis: null,
      selectedTemplate: null,
      generatedScript: null,
    }))

    // Load any cached records from session
    const cached = getSessionRecords(config.url)
    if (cached.length > 0) {
      setState(s => ({ ...s, records: cached }))
    }

    addRecentUrl(config.url)
    setRecentUrls(getRecentUrls())

    // First fetch
    try {
      const records = await fetchFeed(config)
      setState(s => {
        const merged = dedupeRecords(cached, records)
        saveSessionRecords(config.url, merged)
        return { ...s, status: 'connected', records: merged }
      })
      setLastUpdated(Date.now())

      // Trigger analysis after first successful fetch
      if (records.length > 0) {
        analyzeData(records)
      }
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Connection failed',
      }))
      return
    }

    // Poll loop
    pollRef.current = setInterval(async () => {
      try {
        const records = await fetchFeed(config)
        setState(s => {
          const merged = dedupeRecords(s.records, records)
          saveSessionRecords(config.url, merged)
          // Re-analyze if we got significantly more data
          if (merged.length >= s.records.length + 10 && !s.isAnalyzing) {
            analysisTriggeredRef.current = false
            analyzeData(merged)
          }
          return { ...s, records: merged }
        })
        setLastUpdated(Date.now())
      } catch {
        // silently continue polling on transient errors
      }
    }, config.pollInterval * 1000)
  }, [fetchFeed, analyzeData])

  const stopMonitoring = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setState(s => ({ ...s, status: 'idle' }))
  }, [])

  const generateScript = useCallback(async (template: TemplateType) => {
    setState(s => ({ ...s, selectedTemplate: template, isGenerating: true }))
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          feedUrl: state.feedConfig.url,
          analysis: state.analysis,
        }),
      })
      const result = await res.json()
      if (result.code) {
        setState(s => ({
          ...s,
          generatedScript: { template, code: result.code, filename: result.filename },
          isGenerating: false,
        }))
        // Scroll to script output
        setTimeout(() => {
          document.getElementById('script-output')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      } else {
        setState(s => ({ ...s, isGenerating: false, error: result.error ?? 'Script generation failed' }))
      }
    } catch (err) {
      setState(s => ({
        ...s,
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Generation failed',
      }))
    }
  }, [state.feedConfig.url, state.analysis])

  const isActive = state.status === 'connected' || state.status === 'connecting'
  const hasData = state.records.length > 0

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero section */}
        <div className="relative overflow-hidden border-b border-border">
          {/* Background grid */}
          <div className="absolute inset-0 bg-grid opacity-30" />
          {/* Gradient orbs */}
          <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-cyan/5 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            {/* Badge */}
            <div className="mb-4 flex justify-center sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-light">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-light" />
                ML-Powered Activity Monitor
              </span>
            </div>

            <h1 className="text-center text-3xl font-bold tracking-tight sm:text-left sm:text-4xl">
              <span className="text-slate-100">Monitor any feed</span>
              <br />
              <span className="gradient-text">with AI + ML</span>
            </h1>
            <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-500 sm:text-left">
              Paste an endpoint URL from any activity feed — polymarket, crypto platforms, gig work dashboards,
              trading activity. Get instant AI insights and generate production-ready Python analysis scripts.
            </p>

            {/* Use case pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                '📈 Polymarket', '₿ Crypto Activity', '🎯 X Contests',
                '💼 Gig Work', '📊 Trading Signals', '🎰 Raffle Analysis',
              ].map(uc => (
                <span
                  key={uc}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-slate-500"
                >
                  {uc}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-8">

            {/* Step 1: Feed setup */}
            <section>
              <SectionLabel number={1} label="Connect your activity feed" />
              <div className="mt-3">
                <FeedSetup
                  config={state.feedConfig}
                  status={state.status}
                  onStart={startMonitoring}
                  onStop={stopMonitoring}
                  recentUrls={recentUrls}
                />
              </div>
              {state.error && (
                <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  <strong>Error:</strong> {state.error}
                </div>
              )}
            </section>

            {/* Step 2 + 3: Live data + Insights (side by side when both active) */}
            {(isActive || hasData) && (
              <section className="animate-slide-up">
                <SectionLabel number={2} label="Live data stream" />
                <div className="mt-3 grid gap-4 xl:grid-cols-3">
                  {/* Live monitor - takes 2/3 */}
                  <div className="xl:col-span-2">
                    <LiveMonitor
                      records={state.records}
                      analysis={state.analysis}
                      lastUpdated={lastUpdated}
                      pollInterval={state.feedConfig.pollInterval}
                    />
                  </div>
                  {/* AI Insights - takes 1/3 */}
                  <div>
                    <AIInsights
                      analysis={state.analysis}
                      isAnalyzing={state.isAnalyzing}
                      onSelectTemplate={generateScript}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Step 3: ML Templates */}
            {hasData && (
              <section className="animate-slide-up">
                <SectionLabel number={3} label="Generate ML analysis script" />
                <div className="mt-3">
                  <MLTemplates
                    selected={state.selectedTemplate}
                    isGenerating={state.isGenerating}
                    analysis={state.analysis}
                    onSelect={generateScript}
                  />
                </div>
              </section>
            )}

            {/* Script output */}
            {state.generatedScript && (
              <section id="script-output" className="animate-slide-up">
                <ScriptOutput
                  script={state.generatedScript}
                  onClose={() => setState(s => ({ ...s, generatedScript: null, selectedTemplate: null }))}
                />
              </section>
            )}

            {/* Empty state — no feed yet */}
            {!isActive && !hasData && (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-6 grid grid-cols-3 gap-3 opacity-40">
                  {['🔴', '💬', '📈'].map((emoji, i) => (
                    <div
                      key={i}
                      className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-2xl"
                    >
                      {emoji}
                    </div>
                  ))}
                </div>
                <p className="text-sm font-medium text-slate-500">
                  Paste a feed URL above to get started
                </p>
                <p className="mt-1.5 max-w-sm text-xs text-slate-700">
                  The app will poll the URL on your chosen interval, analyze the data structure with AI,
                  and generate a custom ML script for deeper analysis.
                </p>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-slate-700">
              RaffleML — Built with Next.js + Groq + scikit-learn
            </p>
            <div className="flex items-center gap-4 text-[10px] text-slate-700">
              <span>Keys stored locally · no data leaves your browser</span>
              <a
                href="https://github.com/genjess/raffleml"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-400"
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SectionLabel({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent-light ring-1 ring-accent/30">
        {number}
      </span>
      <h2 className="text-sm font-semibold text-slate-300">{label}</h2>
    </div>
  )
}
