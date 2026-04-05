import { NextRequest, NextResponse } from 'next/server'
import type { TemplateType, AIAnalysis } from '@/types'
import { generateAnomalyScript } from '@/lib/templates/anomaly'
import { generateSentimentScript } from '@/lib/templates/sentiment'
import { generateTimeseriesScript } from '@/lib/templates/timeseries'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { template, feedUrl, analysis } = body as {
      template: TemplateType
      feedUrl: string
      analysis: AIAnalysis | null
    }

    if (!template || !feedUrl) {
      return NextResponse.json(
        { error: 'template and feedUrl are required' },
        { status: 400 }
      )
    }

    let code: string
    let filename: string

    switch (template) {
      case 'anomaly':
        code = generateAnomalyScript(feedUrl, analysis)
        filename = 'raffleml_anomaly_detection.py'
        break
      case 'sentiment':
        code = generateSentimentScript(feedUrl, analysis)
        filename = 'raffleml_sentiment_analysis.py'
        break
      case 'timeseries':
        code = generateTimeseriesScript(feedUrl, analysis)
        filename = 'raffleml_timeseries_forecast.py'
        break
      default:
        return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
    }

    return NextResponse.json({ code, filename, template })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Script generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
