import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get('event');
  const base = 'https://fantasy.premierleague.com/api/fixtures/';
  const url = event ? `${base}?event=${encodeURIComponent(event)}` : base;

  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    console.error('fixtures proxy error', err);
    return NextResponse.json({ error: 'failed to fetch fixtures' }, { status: 502 });
  }
}
