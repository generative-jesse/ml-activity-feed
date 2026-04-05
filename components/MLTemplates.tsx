'use client'

import { AlertTriangle, MessageSquare, TrendingUp, Loader2, ArrowRight } from 'lucide-react'
import type { TemplateType, AIAnalysis } from '@/types'

interface TemplateCard {
  id: TemplateType
  icon: React.ComponentType<{ className?: string }>
  color: string
  glow: string
  title: string
  subtitle: string
  description: string
  useCases: string[]
  models: string[]
}

const TEMPLATES: TemplateCard[] = [
  {
    id: 'anomaly',
    icon: AlertTriangle,
    color: 'text-red-400',
    glow: 'border-red-400/25 hover:border-red-400/50 hover:shadow-[0_0_20px_rgba(248,81,73,0.12)]',
    title: 'Anomaly Detection',
    subtitle: 'Isolation Forest + Z-score',
    description: 'Detect unusual spikes, drops, and outliers in numerical activity streams using statistical + ML approaches.',
    useCases: ['Crypto deposits/withdrawals', 'Trading activity spikes', 'Polymarket odds jumps', 'Platform abuse detection'],
    models: ['Isolation Forest', 'Statistical Z-score', 'Rolling Baseline'],
  },
  {
    id: 'sentiment',
    icon: MessageSquare,
    color: 'text-yellow-400',
    glow: 'border-yellow-400/25 hover:border-yellow-400/50 hover:shadow-[0_0_20px_rgba(250,204,21,0.1)]',
    title: 'Sentiment Analysis',
    subtitle: 'HuggingFace + VADER',
    description: 'Analyze text fields for sentiment, extract top keywords, track engagement patterns, and optimize content.',
    useCases: ['X/Twitter contest optimization', 'Gig work survey analysis', 'Community sentiment', 'Review monitoring'],
    models: ['cardiffnlp/twitter-roberta', 'VADER (fallback)', 'Keyword frequency'],
  },
  {
    id: 'timeseries',
    icon: TrendingUp,
    color: 'text-cyan',
    glow: 'border-cyan/25 hover:border-cyan/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]',
    title: 'Time Series Forecast',
    subtitle: 'Prophet + ARIMA',
    description: 'Forecast future values from historical patterns. Includes trend decomposition, seasonality, and confidence intervals.',
    useCases: ['Polymarket price prediction', 'Survey volume forecasting', 'Trading signal timing', 'Activity trend analysis'],
    models: ['Facebook Prophet', 'ARIMA (fallback)', 'Trend decomposition'],
  },
]

interface Props {
  selected: TemplateType | null
  isGenerating: boolean
  analysis: AIAnalysis | null
  onSelect: (t: TemplateType) => void
}

export default function MLTemplates({ selected, isGenerating, analysis, onSelect }: Props) {
  const suggested = analysis?.suggestedTemplate

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Choose an ML Template</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Generates a complete Python script — run in Google Colab or locally
          </p>
        </div>
        {suggested && (
          <span className="text-[10px] text-slate-500">
            AI suggests: <span className="text-accent-light font-medium">{suggested}</span>
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {TEMPLATES.map(tpl => {
          const isSelected = selected === tpl.id
          const isSuggested = suggested === tpl.id && !selected
          const isLoading = isGenerating && isSelected

          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              disabled={isGenerating}
              className={`relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all duration-200 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-accent/60 bg-accent/5 shadow-[0_0_20px_rgba(109,40,217,0.15)]'
                  : `border-border ${tpl.glow}`
              }`}
            >
              {isSuggested && (
                <span className="absolute right-3 top-3 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-light">
                  Suggested
                </span>
              )}

              {/* Icon */}
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-surface`}>
                {isLoading ? (
                  <Loader2 className={`h-5 w-5 animate-spin ${tpl.color}`} />
                ) : (
                  <tpl.icon className={`h-5 w-5 ${tpl.color}`} />
                )}
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-slate-200">{tpl.title}</p>
              <p className={`mt-0.5 text-[10px] font-mono ${tpl.color}`}>{tpl.subtitle}</p>

              {/* Description */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {tpl.description}
              </p>

              {/* Use cases */}
              <div className="mt-3 space-y-1">
                {tpl.useCases.map(uc => (
                  <div key={uc} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                    <span className={`h-1 w-1 rounded-full ${tpl.color.replace('text-', 'bg-')}`} />
                    {uc}
                  </div>
                ))}
              </div>

              {/* Models */}
              <div className="mt-3 flex flex-wrap gap-1">
                {tpl.models.map(m => (
                  <span
                    key={m}
                    className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-mono text-slate-600"
                  >
                    {m}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <div
                className={`mt-4 flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  isSelected ? 'text-accent-light' : 'text-slate-500'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating script…
                  </>
                ) : isSelected ? (
                  <>Script ready</>
                ) : (
                  <>
                    Generate script
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
