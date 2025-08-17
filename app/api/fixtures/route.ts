export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const event = searchParams.get('event');
  const base = 'https://fantasy.premierleague.com/api/fixtures/';
  const url = event ? `${base}?event=${encodeURIComponent(event)}` : base;

  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'accept': 'application/json,text/plain,*/*',
        'accept-encoding': 'gzip, deflate, br',
        'referer': 'https://fantasy.premierleague.com/',
      },
    });

    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('fixtures proxy error', err);
    return NextResponse.json({ error: 'failed to fetch fixtures' }, { status: 502 });
  }
}
