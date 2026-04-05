import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, headers = {} } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    // Basic URL validation
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only http/https URLs allowed' }, { status: 400 })
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RaffleML/1.0',
        ...headers,
      },
      signal: AbortSignal.timeout(15000),
    })

    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      // Return raw text if not JSON
      return NextResponse.json({
        ok: response.ok,
        status: response.status,
        contentType,
        raw: text.slice(0, 2000),
        isJson: false,
      })
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      contentType,
      data,
      isJson: true,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
