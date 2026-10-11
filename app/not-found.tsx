import { ButtonLink, StateMessage, getT } from "@/components/ui";
import { initLocale } from "./locale";

export default async function NotFound() {
  await initLocale();
  const t = getT();
  return (
    <StateMessage headingLevel={1} title={t.notFound.title} action={<ButtonLink href="/">{t.common.backToTable}</ButtonLink>}>
      <p>{t.notFound.body}</p>
    </StateMessage>
  );
}
