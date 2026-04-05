'use client'

import { useState, useMemo } from 'react'
import { Table, Code, TrendingUp, Clock, Database, RefreshCw, Wifi } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import type { FeedRecord, AIAnalysis, ViewMode } from '@/types'

interface Props {
  records: FeedRecord[]
  analysis: AIAnalysis | null
  lastUpdated: number | null
  pollInterval: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (depth > 4) return <span className="text-slate-500">…</span>
  if (data === null) return <span className="text-rose-400">null</span>
  if (typeof data === 'boolean') return <span className="text-amber-400">{String(data)}</span>
  if (typeof data === 'number') return <span className="text-cyan">{data}</span>
  if (typeof data === 'string') {
    const short = data.length > 60 ? data.slice(0, 60) + '…' : data
    return <span className="text-green-400">"{short}"</span>
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-slate-400">[]</span>
    return (
      <span>
        <span className="text-slate-400">[</span>
        <span className="text-slate-500 text-[10px]"> {data.length} items</span>
        <span className="text-slate-400">]</span>
      </span>
    )
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).slice(0, 6)
    return (
      <span className="block">
        {entries.map(([k, v]) => (
          <span key={k} className="block" style={{ paddingLeft: (depth + 1) * 12 }}>
            <span className="text-accent-light">"{k}"</span>
            <span className="text-slate-500">: </span>
            <JsonTree data={v} depth={depth + 1} />
          </span>
        ))}
        {Object.keys(data as object).length > 6 && (
          <span className="block text-slate-500 text-[10px]" style={{ paddingLeft: (depth + 1) * 12 }}>
            … {Object.keys(data as object).length - 6} more
          </span>
        )}
      </span>
    )
  }
  return <span className="text-slate-300">{String(data)}</span>
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400">{payload[0].payload.time}</p>
      <p className="font-semibold text-accent-light">{payload[0].value?.toFixed(4)}</p>
    </div>
  )
}

export default function LiveMonitor({ records, analysis, lastUpdated, pollInterval }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const numericField = analysis?.targetField

  const chartData = useMemo(() => {
    if (!numericField) return []
    return records
      .filter(r => typeof r[numericField] === 'number' || !isNaN(Number(r[numericField])))
      .slice(-60)
      .map((r, i) => ({
        i,
        time: new Date(r._collected_at).toLocaleTimeString(),
        value: Number(r[numericField]),
      }))
  }, [records, numericField])

  const tableColumns = useMemo(() => {
    if (!records.length) return []
    const cols = Object.keys(records[0]).filter(k => !k.startsWith('_'))
    return cols.slice(0, 8)
  }, [records])

  const pageRecords = records.slice().reverse().slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(records.length / pageSize)

  const stats = useMemo(() => {
    if (!numericField || !records.length) return null
    const vals = records.map(r => Number(r[numericField])).filter(v => !isNaN(v))
    if (!vals.length) return null
    return {
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      max: Math.max(...vals),
      min: Math.min(...vals),
      last: vals[vals.length - 1],
    }
  }, [records, numericField])

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
          <Wifi className="h-6 w-6 text-accent/50" />
        </div>
        <p className="text-sm font-medium text-slate-300">Waiting for data…</p>
        <p className="mt-1 text-xs text-slate-600">
          Connected. First poll in progress.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBadge icon={Database} label="Records" value={records.length.toLocaleString()} />
        <StatBadge
          icon={Clock}
          label="Last poll"
          value={lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : '–'}
        />
        <StatBadge icon={RefreshCw} label="Interval" value={`${pollInterval}s`} />
        {stats && (
          <StatBadge
            icon={TrendingUp}
            label={numericField ?? 'Value'}
            value={stats.last?.toFixed(4) ?? '–'}
            sub={`avg ${stats.mean.toFixed(4)}`}
          />
        )}
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{records.length} records collected</p>
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {([
            { mode: 'table' as ViewMode, icon: Table, label: 'Table' },
            { mode: 'json' as ViewMode, icon: Code, label: 'JSON' },
            { mode: 'chart' as ViewMode, icon: TrendingUp, label: 'Chart' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                viewMode === mode
                  ? 'bg-accent/20 text-accent-light'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {tableColumns.map(col => (
                    <th
                      key={col}
                      className={`px-3 py-2.5 text-left font-medium text-slate-500 ${
                        col === analysis?.targetField ? 'text-cyan' : ''
                      }`}
                    >
                      {col}
                      {col === analysis?.targetField && (
                        <span className="ml-1 text-[9px] text-cyan/60">target</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((record, i) => (
                  <tr
                    key={record._id}
                    className={`border-b border-border/50 transition-colors hover:bg-card-hover ${
                      i === 0 && page === 0 ? 'bg-accent/5' : ''
                    }`}
                  >
                    {tableColumns.map(col => {
                      const val = record[col]
                      const isTarget = col === analysis?.targetField
                      return (
                        <td
                          key={col}
                          className={`px-3 py-2 ${isTarget ? 'text-cyan font-mono font-medium' : 'text-slate-400'}`}
                        >
                          {val === null || val === undefined
                            ? <span className="text-slate-700">—</span>
                            : typeof val === 'object'
                            ? <span className="text-slate-600 font-mono">{'{…}'}</span>
                            : String(val).slice(0, 40)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-3 py-2">
                <p className="text-[10px] text-slate-600">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded px-2 py-1 text-[10px] text-slate-500 disabled:opacity-40 hover:text-slate-300"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="rounded px-2 py-1 text-[10px] text-slate-500 disabled:opacity-40 hover:text-slate-300"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'json' && (
          <div className="max-h-[400px] overflow-y-auto p-4 font-mono text-xs">
            {pageRecords.slice(0, 5).map((record) => (
              <div key={record._id} className="mb-3 rounded-lg border border-border/50 bg-surface p-3">
                <span className="text-slate-600 text-[10px] mb-1 block">
                  {new Date(record._collected_at).toLocaleTimeString()}
                </span>
                <JsonTree data={record} />
              </div>
            ))}
          </div>
        )}

        {viewMode === 'chart' && (
          <div className="p-4">
            {chartData.length > 1 ? (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  {numericField ? `${numericField} over time` : 'No numeric field detected'}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#1c1c35" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#475569', fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: '#1c1c35' }}
                    />
                    <YAxis
                      tick={{ fill: '#475569', fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: '#1c1c35' }}
                      width={60}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#8b5cf6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="py-8 text-center text-xs text-slate-600">
                {numericField
                  ? `Collecting more data points… (${chartData.length} so far)`
                  : 'No numeric field detected for charting. Add a Groq API key for better detection.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBadge({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-accent/60" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-200">{value}</p>
        {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}
