// Persistent per-browser device identifier for the single-device-at-a-time login limit (see
// supabase/migrations/20261013210000_device_login_limits.sql). This is NOT a security boundary —
// clearing site data or using a different browser/profile generates a fresh id, which
// register_device_login() then treats as a brand-new device. It's the practical meaning of "a
// device" for a web app with no native device APIs, same tradeoff the old app's original design
// had; real enforcement (actually ending the other session) comes from
// supabase.auth.signOut({scope:'others'}), not from this id.
const STORAGE_KEY = "diamond_device_id";

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage unavailable (private mode, blocked site data) — fall back to a per-load id.
    // This means every page load looks like "a new device" to the server, which is a reasonable
    // failure mode (never falsely blocks, just never recognizes a returning device either).
    return crypto.randomUUID();
  }
}
