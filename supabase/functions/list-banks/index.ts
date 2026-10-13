// Returns Paystack's list of Nigerian banks it can pay out to — populates the "Financial
// institution" dropdown on the Affiliate page's add-payout-method form, so a student picks a
// real, supported bank instead of typing a bank code/name free-hand.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { listBanks } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    await verifyUser(req);

    const result = await listBanks();
    if (!result.status) {
      throw new HttpError(502, result.message || "Could not load the bank list.");
    }

    const banks = result.data
      .map((b) => ({ name: b.name, code: b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ success: true, banks });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
