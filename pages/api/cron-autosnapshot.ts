// pages/api/cron-autosnapshot.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const r = await fetch('https://fpl-backend-poix.onrender.com/autosnapshot/1391467', {
      method: 'POST',
    })
    const data = await r.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to call backend', detail: String(err) })
  }
}
