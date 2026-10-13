import { TimesNotFound } from "@/components/views/NotFoundView";
import { initLocale } from "@/app/locale";

/** An issue that isn't on the shelf: the way out is the front page of The Times. */
export default async function TimesNotFoundPage() {
  await initLocale();
  return <TimesNotFound />;
}
