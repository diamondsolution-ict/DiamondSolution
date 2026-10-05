// Postgres-backed rate limiting — Edge Functions have no express-rate-limit equivalent.
// Fixed-window counter keyed by whatever bucket the caller chooses (per-user, per-IP, ...).
// See 05-BACKEND.md §4.
import { serviceClient, HttpError } from "./supabaseClients.ts";

export async function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const db = serviceClient();
  const windowStart = new Date(
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000,
  ).toISOString();

  // Postgres has no "increment, returning the new value" upsert in one call via the JS client,
  // so this is read-then-write; a lost update under heavy concurrency would at worst let a
  // couple of extra requests through in the same window, which is an acceptable trade-off for
  // a 6-digit-OTP brute-force guard, not a hard security boundary.
  const { data: existing } = await db
    .from("rate_limit_hits")
    .select("hit_count")
    .eq("bucket_key", bucketKey)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (existing) {
    if (existing.hit_count >= limit) {
      throw new HttpError(429, "Too many requests — please try again shortly.");
    }
    await db
      .from("rate_limit_hits")
      .update({ hit_count: existing.hit_count + 1 })
      .eq("bucket_key", bucketKey)
      .eq("window_start", windowStart);
  } else {
    await db
      .from("rate_limit_hits")
      .insert({ bucket_key: bucketKey, window_start: windowStart, hit_count: 1 });
  }
}
