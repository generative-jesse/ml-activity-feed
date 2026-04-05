'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Monitor, Network, Filter, Copy, CheckCircle } from 'lucide-react'

const steps = [
  {
    icon: Monitor,
    title: 'Open Developer Tools',
    detail: 'Press F12 (Windows/Linux) or Cmd+Option+I (Mac) while on the page you want to monitor.',
  },
  {
    icon: Network,
    title: 'Go to the Network tab',
    detail: 'Click the "Network" tab at the top of DevTools. If it\'s empty, refresh the page.',
  },
  {
    icon: Filter,
    title: 'Filter for Fetch / XHR',
    detail: 'Click "Fetch/XHR" in the filter bar. This shows only API calls, not images/CSS.',
  },
  {
    icon: Copy,
    title: 'Find the activity endpoint',
    detail: 'Look for a request that updates frequently. Click it, then right-click → "Copy" → "Copy URL". Paste it above.',
  },
]

interface Props {
  defaultOpen?: boolean
}

export default function DevToolsGuide({ defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)

  const example = 'https://api.example.com/v1/activity/feed'

  function copyExample() {
    navigator.clipboard.writeText(example).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-card-hover"
      >
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-cyan" />
          <span className="text-sm font-medium text-slate-200">
            How to find your feed URL
          </span>
          <span className="rounded bg-cyan/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan">
            DevTools Guide
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 ring-1 ring-accent/30">
                  <step.icon className="h-3.5 w-3.5 text-accent-light" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    <span className="mr-1.5 text-accent-light">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-cyan/20 bg-cyan/5 p-3">
            <p className="mb-2 text-xs font-medium text-cyan">Example URL format</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-bg px-3 py-2 text-xs font-mono text-slate-300 border border-border">
                {example}
              </code>
              <button
                onClick={copyExample}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs text-slate-400 transition-colors hover:border-cyan/40 hover:text-cyan"
              >
                {copied ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Tip: The URL often contains words like <span className="text-slate-300">feed</span>,{' '}
              <span className="text-slate-300">activity</span>,{' '}
              <span className="text-slate-300">events</span>, or{' '}
              <span className="text-slate-300">recent</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
