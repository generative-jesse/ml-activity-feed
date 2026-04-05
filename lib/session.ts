import type { ApiKeys, FeedConfig, FeedRecord } from '@/types'

const KEYS_KEY = 'raffleml_api_keys'
const FEEDS_KEY = 'raffleml_feeds'
const RECORDS_KEY = 'raffleml_records'
const RECENT_URLS_KEY = 'raffleml_recent_urls'

const defaultKeys: ApiKeys = {
  groq: '',
  supabase_url: '',
  supabase_anon_key: '',
  huggingface: '',
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function safeSet(key: string, value: unknown, persist = false): void {
  if (typeof window === 'undefined') return
  try {
    const str = JSON.stringify(value)
    sessionStorage.setItem(key, str)
    if (persist) localStorage.setItem(key, str)
  } catch {}
}

// --- API Keys (persisted to localStorage for convenience) ---
export function getApiKeys(): ApiKeys {
  return safeGet<ApiKeys>(KEYS_KEY, defaultKeys)
}

export function saveApiKeys(keys: ApiKeys): void {
  safeSet(KEYS_KEY, keys, true)
}

export function clearApiKeys(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEYS_KEY)
  localStorage.removeItem(KEYS_KEY)
}

// --- Recent feed URLs (session only) ---
export function getRecentUrls(): string[] {
  return safeGet<string[]>(RECENT_URLS_KEY, [])
}

export function addRecentUrl(url: string): void {
  const urls = getRecentUrls()
  const updated = [url, ...urls.filter(u => u !== url)].slice(0, 10)
  safeSet(RECENT_URLS_KEY, updated)
}

// --- Saved feed configs (persisted) ---
export function getSavedFeeds(): FeedConfig[] {
  return safeGet<FeedConfig[]>(FEEDS_KEY, [])
}

export function saveFeed(config: FeedConfig): void {
  const feeds = getSavedFeeds()
  const existing = feeds.findIndex(f => f.url === config.url)
  if (existing >= 0) feeds[existing] = config
  else feeds.unshift(config)
  safeSet(FEEDS_KEY, feeds.slice(0, 20), true)
}

// --- Live records (session only) ---
export function getSessionRecords(feedUrl: string): FeedRecord[] {
  const all = safeGet<Record<string, FeedRecord[]>>(RECORDS_KEY, {})
  return all[feedUrl] ?? []
}

export function saveSessionRecords(feedUrl: string, records: FeedRecord[]): void {
  const all = safeGet<Record<string, FeedRecord[]>>(RECORDS_KEY, {})
  all[feedUrl] = records.slice(-500) // keep last 500
  safeSet(RECORDS_KEY, all)
}

export function clearSessionRecords(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(RECORDS_KEY)
}
