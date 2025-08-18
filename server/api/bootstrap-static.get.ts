type TEvent = { id: number; is_current?: boolean; finished?: boolean };
type TTeam = { id: number; short_name: string; name: string; code?: number };
type TElement = { id: number; web_name: string; team: number; element_type: 1|2|3|4 };
export type Bootstrap = { events: TEvent[]; teams: TTeam[]; elements: TElement[] };

export default defineEventHandler<Promise<Bootstrap>>(async (event) => {
  const cfg = useRuntimeConfig();
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '');

  // 1) Try your backend
  if (base) {
    try {
      return await $fetch<Bootstrap>(`${base}/bootstrap-static`, { cache: 'no-store' });
    } catch {
      // fall through
    }
  }

  // 2) Fallback to official FPL
  return await $fetch<Bootstrap>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { headers: { referer: 'https://fantasy.premierleague.com/' } }
  );
});