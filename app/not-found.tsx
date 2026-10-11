import { ButtonLink, StateMessage } from "@/components/ui";

export default function NotFound() {
  return (
    <StateMessage
      headingLevel={1}
      title="Page not found"
      action={<ButtonLink href="/">Back to table</ButtonLink>}
    >
      <p>That page or FPL team doesn&apos;t exist. Team links use the numeric FPL entry ID, e.g. /team/2379133.</p>
    </StateMessage>
  );
}
