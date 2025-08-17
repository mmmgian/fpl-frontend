import { NextResponse } from 'next/server';

export async function GET() {
  const url = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    console.error('bootstrap-static proxy error', err);
    return NextResponse.json({ error: 'failed to fetch bootstrap-static' }, { status: 502 });
  }
}
