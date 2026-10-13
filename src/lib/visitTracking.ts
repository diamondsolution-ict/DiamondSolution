// Real data source for the admin Analytics tab's visit/engagement sections (see
// supabase/migrations/20261013140000_page_visits_and_affiliate_payouts.sql) — one row per page
// view inside the student-facing app. Fire-and-forget: a tracking failure must never surface to
// the student or block navigation, so it's logged to the console and nothing else.
import { supabase } from "@/lib/supabase";

export function logPageVisit(userId: string, path: string) {
  void supabase
    .from("page_visits")
    .insert({
      user_id: userId,
      path,
      // JS's own offset convention (minutes to ADD to local time to reach UTC) — the
      // admin_visit_peak_hours() RPC subtracts it back off to recover each visitor's local hour.
      tz_offset_minutes: new Date().getTimezoneOffset(),
    })
    .then(({ error }) => {
      if (error) console.warn("Page visit log failed:", error.message);
    });
}
