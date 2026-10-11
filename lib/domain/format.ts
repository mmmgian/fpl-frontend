/** Display formatting for domain values. Pure. */

export const formatMoney = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
export const formatRank = (n: number | null | undefined) => (n ? n.toLocaleString("en-GB") : "—");
export const formatNumber = (n: number) => n.toLocaleString("en-GB");

/**
 * One decimal place, rounded half-up on the decimal value. `toFixed` works on the binary double, so it turns
 * 32.55 into "32.5"; adding a tiny epsilon first makes it "32.6" as a person would expect.
 */
export const oneDecimal = (n: number) => (Math.round((n + Number.EPSILON) * 10) / 10).toFixed(1);

/** File size for people: 3.4 MB, 273 KB. Binary units, one decimal from MB up. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
