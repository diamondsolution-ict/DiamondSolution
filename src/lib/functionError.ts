// supabase.functions.invoke() does NOT parse the response body into `data` when an Edge
// Function returns a non-2xx status — it throws a FunctionsHttpError first, whose own message
// is just the generic "Edge Function returned a non-2xx status code". The function's actual
// error message (e.g. "Payment was not successful.", a friendly validation message, ...) only
// lives in error.context, the raw Response object, and has to be read back out with
// error.context.json(). Every call site in this app that did `data?.error ?? error?.message`
// was silently swallowing that real message on every non-2xx response — this was caught while
// testing PaymentHistory's recheck-on-failure path, where the student would otherwise only ever
// see "Edge Function returned a non-2xx status code" instead of "Payment was not successful."
import { FunctionsHttpError } from "@supabase/supabase-js";

export async function functionErrorMessage(
  data: { error?: string } | null | undefined,
  error: unknown,
  fallback = "Something went wrong.",
): Promise<string> {
  if (data?.error) return data.error;
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Non-JSON or unreadable body — fall through to the generic message below.
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
