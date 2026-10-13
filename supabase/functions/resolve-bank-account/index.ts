// Resolves the real account name from a bank + account number via Paystack — the account name
// shown to a student adding a payout method is never typed by hand, it's read straight from the
// institution, the same verification every Nigerian fintech app runs before accepting a bank
// account (and it catches a mistyped account number before it ever reaches a real payout).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { resolveAccountNumber } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    await verifyUser(req);

    const { account_number, bank_code } = await req.json();
    if (
      typeof account_number !== "string" ||
      !/^\d{10}$/.test(account_number) ||
      typeof bank_code !== "string" ||
      !bank_code
    ) {
      throw new HttpError(
        400,
        "A 10-digit account_number and a bank_code are required.",
      );
    }

    const result = await resolveAccountNumber(account_number, bank_code);
    if (!result.status) {
      throw new HttpError(
        422,
        result.message ||
          "Could not resolve this account. Check the account number and bank, then try again.",
      );
    }

    return jsonResponse({
      success: true,
      account_name: result.data.account_name,
      account_number: result.data.account_number,
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
