import { NextRequest, NextResponse } from 'next/server'
import type { AIAnalysis } from '@/types'

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama3-8b-8192'

function buildPrompt(sample: unknown[]): string {
  const sampleStr = JSON.stringify(sample.slice(0, 5), null, 2)
  return `You are a data scientist analyzing a live activity feed. Given a sample of JSON records, identify the data structure and best ML approach.

Respond ONLY with valid JSON in this exact schema:
{
  "dataType": "brief description of what this data represents (e.g. 'crypto withdrawal events', 'polymarket trade activity')",
  "keyFields": [
    {"field": "fieldName", "type": "string|number|timestamp|boolean|object|array", "description": "what this field represents"}
  ],
  "potentialUseCase": "one sentence on what insights you can extract",
  "suggestedTemplate": "anomaly OR sentiment OR timeseries",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "targetField": "most important numeric field to analyze or null",
  "timestampField": "timestamp field name or null"
}

Data sample (${sample.length} records):
${sampleStr}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { records, apiKey } = body

    const groqKey = apiKey || process.env.GROQ_API_KEY

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records array required' }, { status: 400 })
    }

    if (!groqKey) {
      // Return a basic schema analysis without AI
      const sample = records[0] as Record<string, unknown>
      const fields = Object.entries(sample).map(([field, val]) => ({
        field,
        type: (Array.isArray(val) ? 'array' :
               val === null ? 'string' :
               typeof val === 'number' ? 'number' :
               typeof val === 'boolean' ? 'boolean' :
               typeof val === 'object' ? 'object' :
               /^\d{4}-\d{2}-\d{2}/.test(String(val)) ? 'timestamp' : 'string') as AIAnalysis['keyFields'][0]['type'],
        description: field,
        sample: String(val).slice(0, 50),
      }))

      const numericFields = fields.filter(f => f.type === 'number')
      const tsFields = fields.filter(f => f.type === 'timestamp')

      const result: AIAnalysis = {
        dataType: 'Activity feed data',
        keyFields: fields.slice(0, 10),
        potentialUseCase: 'Add a Groq API key to get AI-powered insights',
        suggestedTemplate: numericFields.length > 0 ? 'anomaly' : 'sentiment',
        insights: [
          `${fields.length} fields detected`,
          numericFields.length > 0 ? `${numericFields.length} numeric fields: ${numericFields.map(f => f.field).join(', ')}` : 'No numeric fields detected',
          tsFields.length > 0 ? `Timestamp field: ${tsFields[0].field}` : 'No timestamp field detected — add a Groq key for smarter detection',
        ],
        targetField: numericFields[0]?.field ?? null,
        timestampField: tsFields[0]?.field ?? null,
      }

      return NextResponse.json({ analysis: result, method: 'basic' })
    }

    const prompt = buildPrompt(records)

    const response = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 })
    }

    const groqData = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const content = groqData.choices[0]?.message?.content ?? '{}'

    let analysis: AIAnalysis
    try {
      analysis = JSON.parse(content) as AIAnalysis
    } catch {
      return NextResponse.json({ error: 'Failed to parse Groq response' }, { status: 500 })
    }

    return NextResponse.json({ analysis, method: 'groq' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
