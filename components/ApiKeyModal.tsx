'use client'

import { useState, useEffect } from 'react'
import { X, Key, Eye, EyeOff, CheckCircle, ExternalLink, Save, Trash2 } from 'lucide-react'
import { getApiKeys, saveApiKeys, clearApiKeys } from '@/lib/session'
import type { ApiKeys } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

interface KeyConfig {
  id: keyof ApiKeys
  label: string
  placeholder: string
  hint: string
  link: string
  linkLabel: string
  required: boolean
}

const KEY_CONFIGS: KeyConfig[] = [
  {
    id: 'groq',
    label: 'Groq API Key',
    placeholder: 'gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    hint: 'Powers AI data analysis. Free tier: 14,400 req/day with llama3-8b-8192.',
    link: 'https://console.groq.com/keys',
    linkLabel: 'console.groq.com',
    required: true,
  },
  {
    id: 'supabase_url',
    label: 'Supabase URL',
    placeholder: 'https://xxxx.supabase.co',
    hint: 'Optional. Enables persistent storage across sessions.',
    link: 'https://supabase.com',
    linkLabel: 'supabase.com → Project → Settings → API',
    required: false,
  },
  {
    id: 'supabase_anon_key',
    label: 'Supabase Anon Key',
    placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    hint: 'Public key from your Supabase project.',
    link: 'https://supabase.com',
    linkLabel: 'supabase.com → Project → Settings → API',
    required: false,
  },
  {
    id: 'huggingface',
    label: 'HuggingFace API Key',
    placeholder: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    hint: 'Optional. Enables cloud-based ML inference in generated scripts.',
    link: 'https://huggingface.co/settings/tokens',
    linkLabel: 'huggingface.co/settings/tokens',
    required: false,
  },
]

function MaskedInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  id: string
}) {
  const [show, setShow] = useState(false)
  const isFilled = value.length > 0

  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface py-2.5 pl-3 pr-10 text-xs font-mono text-slate-300 placeholder-slate-700 outline-none transition-all focus:border-accent/50 focus:shadow-[0_0_0_1px_rgba(109,40,217,0.15)]"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {isFilled && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="text-slate-600 transition-colors hover:text-slate-300"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

export default function ApiKeyModal({ open, onClose }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({ groq: '', supabase_url: '', supabase_anon_key: '', huggingface: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      setKeys(getApiKeys())
      setSaved(false)
    }
  }, [open])

  function updateKey(id: keyof ApiKeys, value: string) {
    setKeys(k => ({ ...k, [id]: value }))
    setSaved(false)
  }

  function handleSave() {
    saveApiKeys(keys)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1200)
  }

  function handleClear() {
    clearApiKeys()
    setKeys({ groq: '', supabase_url: '', supabase_anon_key: '', huggingface: '' })
  }

  if (!open) return null

  const filledCount = Object.values(keys).filter(v => v.length > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
              <Key className="h-4 w-4 text-accent-light" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">API Keys</p>
              <p className="text-[10px] text-slate-500">
                Stored locally in your browser · never sent to any server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Keys */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-5">
          {KEY_CONFIGS.map(cfg => (
            <div key={cfg.id}>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={cfg.id} className="text-xs font-medium text-slate-300">
                  {cfg.label}
                  {cfg.required && (
                    <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-light">
                      RECOMMENDED
                    </span>
                  )}
                </label>
                <a
                  href={cfg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-slate-600 transition-colors hover:text-accent-light"
                >
                  <ExternalLink className="h-3 w-3" />
                  {cfg.linkLabel}
                </a>
              </div>
              <MaskedInput
                id={cfg.id}
                value={keys[cfg.id]}
                onChange={v => updateKey(cfg.id, v)}
                placeholder={cfg.placeholder}
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">{cfg.hint}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 text-xs text-slate-600 transition-colors hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
            <span className="text-[10px] text-slate-700">
              {filledCount}/4 keys set
            </span>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all ${
              saved
                ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30'
                : 'bg-accent text-white hover:bg-accent-light shadow-[0_0_12px_rgba(109,40,217,0.3)]'
            }`}
          >
            {saved ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Keys
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
