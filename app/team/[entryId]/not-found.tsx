import { TeamNotFound } from "@/components/views/NotFoundView";
import { services } from "@/lib/container";
import { initLocale } from "@/app/locale";

/** A team link that doesn't resolve (usually a renamed team): offer the league's teams instead of a dead end. */
export default async function TeamNotFoundPage() {
  await initLocale();
  const teams = await services.team.directory().catch(() => null);
  return <TeamNotFound teams={teams} />;
}
