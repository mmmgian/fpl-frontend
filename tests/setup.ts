import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { testLanguage } from "./language";

afterEach(() => {
  cleanup();
  setRequestLocale("en"); // a test that rendered another language must not leak it into the next
  testLanguage.cookie = undefined;
  testLanguage.acceptLanguage = undefined;
});

// App Router hooks aren't available outside Next; stub the ones our client components use.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Next's data cache needs the Next runtime (unstable_cache throws outside it); pass through in tests.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => fn,
  revalidateTag: vi.fn(),
}));

// Outside a real server render React's `cache` doesn't remember anything, so the per-request language slot would
// forget what a test set. Make it remember for the life of the test run (setup resets it after each test).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
      let memo: { value: unknown } | undefined;
      return ((...args: never[]) => (memo ??= { value: fn(...args) }).value) as T;
    },
  };
});

// Pages read the language from the request's cookie and Accept-Language header; a test sets them via `testLanguage`.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "lobster-lang" && testLanguage.cookie ? { name, value: testLanguage.cookie } : undefined) }),
  headers: async () => new Headers(testLanguage.acceptLanguage ? { "accept-language": testLanguage.acceptLanguage } : {}),
}));
