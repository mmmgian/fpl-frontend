import { after } from "next/server";
import { services } from "@/lib/container";

/** After the response is sent, wake the history server so The Times is quick. Outside a request (tests) it does nothing. */
export function warmHistoryAfterResponse(): void {
  try {
    after(() => services.history.warm());
  } catch {
    // not inside a request: nothing to schedule
  }
}
