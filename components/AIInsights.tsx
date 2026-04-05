'use client'

import { Sparkles, Loader2, Tag, Target, Clock, Zap, ChevronRight } from 'lucide-react'
import type { AIAnalysis, TemplateType } from '@/types'

interface Props {
  analysis: AIAnalysis | null
  isAnalyzing: boolean
  onSelectTemplate: (t: TemplateType) => void
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  anomaly: 'Anomaly Detection',
  sentiment: 'Sentiment Analysis',
  timeseries: 'Time Series Forecast',
}

const TEMPLATE_COLORS: Record<TemplateType, string> = {
  anomaly: 'text-red-400 bg-red-400/10 border-red-400/25',
  sentiment: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  timeseries: 'text-cyan bg-cyan/10 border-cyan/25',
}

const TYPE_ICON: Record<string, string> = {
  string: '📝',
  number: '🔢',
  timestamp: '🕐',
  boolean: '⚡',
  object: '📦',
  array: '📋',
}

export default function AIInsights({ analysis, isAnalyzing, onSelectTemplate }: Props) {
  if (isAnalyzing) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <Loader2 className="h-4 w-4 animate-spin text-accent-light" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Analyzing data…</p>
            <p className="text-xs text-slate-500">AI is reading your feed structure</p>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
          <Sparkles className="h-4 w-4 text-accent-light" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-200">AI Data Analysis</p>
          <p className="text-xs text-slate-500">{analysis.dataType}</p>
        </div>
        {/* Suggested template badge */}
        <button
          onClick={() => onSelectTemplate(analysis.suggestedTemplate)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80 ${
            TEMPLATE_COLORS[analysis.suggestedTemplate]
          }`}
        >
          <Zap className="h-3 w-3" />
          {TEMPLATE_LABELS[analysis.suggestedTemplate]}
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Key fields */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Detected Fields
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.keyFields.slice(0, 12).map(field => (
              <div
                key={field.field}
                className={`flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 ${
                  field.field === analysis.targetField
                    ? 'border-cyan/30 bg-cyan/5'
                    : field.field === analysis.timestampField
                    ? 'border-amber-400/20 bg-amber-400/5'
                    : ''
                }`}
              >
                <span className="text-xs">{TYPE_ICON[field.type] ?? '📄'}</span>
                <span className={`text-xs font-mono ${
                  field.field === analysis.targetField
                    ? 'text-cyan'
                    : field.field === analysis.timestampField
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}>
                  {field.field}
                </span>
                {field.field === analysis.targetField && (
                  <span className="text-[9px] text-cyan/70">target</span>
                )}
                {field.field === analysis.timestampField && (
                  <span className="text-[9px] text-amber-400/70">time</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detected key fields with descriptions */}
        <div className="grid gap-2 sm:grid-cols-2">
          {analysis.targetField && (
            <div className="flex items-start gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2.5">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-cyan/70">Target field</p>
                <p className="text-xs font-mono text-slate-200">{analysis.targetField}</p>
              </div>
            </div>
          )}
          {analysis.timestampField && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/70">Timestamp field</p>
                <p className="text-xs font-mono text-slate-200">{analysis.timestampField}</p>
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Insights
          </p>
          <ul className="space-y-1.5">
            {analysis.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                {insight}
              </li>
            ))}
          </ul>
        </div>

        {/* Use case */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-accent/60" />
          <p className="text-xs text-slate-400">{analysis.potentialUseCase}</p>
        </div>
      </div>
    </div>
  )
}
