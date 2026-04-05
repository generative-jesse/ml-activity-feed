'use client'

import { useState, useRef } from 'react'
import { Link, Play, Square, RefreshCw, ChevronDown, ChevronRight, Plus, Trash2, Clock } from 'lucide-react'
import DevToolsGuide from './DevToolsGuide'
import type { FeedConfig } from '@/types'

interface Props {
  config: FeedConfig
  status: 'idle' | 'connecting' | 'connected' | 'error'
  onStart: (config: FeedConfig) => void
  onStop: () => void
  recentUrls?: string[]
}

const POLL_OPTIONS = [
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 300, label: '5m' },
]

export default function FeedSetup({ config, status, onStart, onStop, recentUrls = [] }: Props) {
  const [url, setUrl] = useState(config.url)
  const [pollInterval, setPollInterval] = useState(config.pollInterval)
  const [showHeaders, setShowHeaders] = useState(false)
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(config.headers).map(([key, value]) => ({ key, value }))
  )
  const [showRecent, setShowRecent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isMonitoring = status === 'connected'
  const isConnecting = status === 'connecting'

  function addHeader() {
    setHeaders(h => [...h, { key: '', value: '' }])
  }
  function removeHeader(i: number) {
    setHeaders(h => h.filter((_, idx) => idx !== i))
  }
  function updateHeader(i: number, field: 'key' | 'value', val: string) {
    setHeaders(h => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }

  function handleStart() {
    if (!url.trim()) return
    const headersObj: Record<string, string> = {}
    headers.forEach(({ key, value }) => {
      if (key.trim()) headersObj[key.trim()] = value
    })
    onStart({ url: url.trim(), pollInterval, headers: headersObj, maxRecords: 1000 })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isMonitoring) handleStart()
  }

  const statusDot = {
    idle: 'bg-slate-600',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-400 animate-pulse-slow',
    error: 'bg-red-400',
  }[status]

  return (
    <div className="space-y-3">
      {/* URL Input Bar */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 transition-all focus-within:border-accent/50 focus-within:shadow-[0_0_0_1px_rgba(109,40,217,0.2)]">
          <div className="flex items-center gap-2 pl-1">
            <div className={`h-2 w-2 rounded-full ${statusDot} shrink-0`} />
            <Link className="h-4 w-4 shrink-0 text-slate-500" />
          </div>

          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => recentUrls.length > 0 && setShowRecent(true)}
              onBlur={() => setTimeout(() => setShowRecent(false), 200)}
              placeholder="https://api.example.com/v1/activity/feed"
              disabled={isMonitoring}
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none disabled:opacity-60"
            />

            {/* Recent URLs dropdown */}
            {showRecent && recentUrls.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
                <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Recent</p>
                {recentUrls.slice(0, 6).map(u => (
                  <button
                    key={u}
                    onMouseDown={() => { setUrl(u); setShowRecent(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-card-hover hover:text-slate-200"
                  >
                    <Clock className="h-3 w-3 shrink-0 text-slate-600" />
                    <span className="truncate">{u}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Poll interval selector */}
          <div className="flex items-center gap-1 border-l border-border pl-2">
            {POLL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPollInterval(opt.value)}
                disabled={isMonitoring}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                  pollInterval === opt.value
                    ? 'bg-accent/20 text-accent-light'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Start / Stop button */}
          {isMonitoring ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 ring-1 ring-red-500/30 transition-all hover:bg-red-500/25"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!url.trim() || isConnecting}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(109,40,217,0.3)]"
            >
              {isConnecting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isConnecting ? 'Connecting…' : 'Monitor'}
            </button>
          )}
        </div>
      </div>

      {/* Custom Headers toggle */}
      <div>
        <button
          onClick={() => setShowHeaders(h => !h)}
          className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          {showHeaders ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Custom headers
          {Object.keys(config.headers).length > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-light">
              {Object.keys(config.headers).length} set
            </span>
          )}
        </button>

        {showHeaders && (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-3">
            {headers.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.key}
                  onChange={e => updateHeader(i, 'key', e.target.value)}
                  placeholder="Header name"
                  className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-accent/50"
                />
                <input
                  value={row.value}
                  onChange={e => updateHeader(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-accent/50"
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="rounded p-1 text-slate-600 transition-colors hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={addHeader}
              className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-accent-light"
            >
              <Plus className="h-3.5 w-3.5" />
              Add header
            </button>
          </div>
        )}
      </div>

      {/* DevTools Guide */}
      <DevToolsGuide />
    </div>
  )
}
