'use client'

import { useState } from 'react'
import { Activity, Key, Github } from 'lucide-react'
import ApiKeyModal from './ApiKeyModal'

export default function Header() {
  const [keysOpen, setKeysOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
                <Activity className="h-4 w-4 text-accent-light" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-100">
                Raffle<span className="text-accent-light">ML</span>
              </span>
              <span className="hidden rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-light sm:block">
                Activity Monitor
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/genjess/raffleml"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-card hover:text-slate-200"
              >
                <Github className="h-3.5 w-3.5" />
                <span className="hidden sm:block">GitHub</span>
              </a>
              <button
                onClick={() => setKeysOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-border transition-all hover:ring-accent/50 hover:text-white"
              >
                <Key className="h-3.5 w-3.5 text-accent-light" />
                API Keys
              </button>
            </div>
          </div>
        </div>
      </header>

      <ApiKeyModal open={keysOpen} onClose={() => setKeysOpen(false)} />
    </>
  )
}
