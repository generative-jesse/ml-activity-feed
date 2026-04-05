export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type TemplateType = 'anomaly' | 'sentiment' | 'timeseries'
export type ViewMode = 'table' | 'json' | 'chart'

export interface FeedRecord {
  _id: string
  _collected_at: number
  [key: string]: unknown
}

export interface SchemaField {
  field: string
  type: 'string' | 'number' | 'timestamp' | 'boolean' | 'object' | 'array'
  description: string
  sample?: string
}

export interface AIAnalysis {
  dataType: string
  keyFields: SchemaField[]
  potentialUseCase: string
  suggestedTemplate: TemplateType
  insights: string[]
  targetField: string | null
  timestampField: string | null
}

export interface ApiKeys {
  groq: string
  supabase_url: string
  supabase_anon_key: string
  huggingface: string
}

export interface FeedConfig {
  url: string
  pollInterval: number
  headers: Record<string, string>
  maxRecords: number
}

export interface GeneratedScript {
  template: TemplateType
  code: string
  filename: string
}

export interface AppState {
  feedConfig: FeedConfig
  status: ConnectionStatus
  records: FeedRecord[]
  analysis: AIAnalysis | null
  isAnalyzing: boolean
  selectedTemplate: TemplateType | null
  generatedScript: GeneratedScript | null
  isGenerating: boolean
  error: string | null
  viewMode: ViewMode
}
