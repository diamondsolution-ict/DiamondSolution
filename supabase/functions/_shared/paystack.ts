const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

export interface PaystackVerifyResult {
  status: boolean;
  data: {
    status: string; // "success" | "failed" | "abandoned" | ...
    reference: string;
    amount: number; // kobo/cents
    currency: string;
    metadata: Record<string, unknown>;
  };
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifyResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    },
  );

  if (!res.ok) {
    throw new Error(`Paystack verify request failed with status ${res.status}`);
  }
  return res.json();
}

interface PaystackTransferRecipientResult {
  status: boolean;
  message: string;
  data: { recipient_code: string };
}

interface PaystackTransferResult {
  status: boolean;
  message: string;
  data: { transfer_code: string; status: string; reference: string };
}

// NGN bank-transfer payouts only — every other currency is settled manually by an admin
// outside this function (Paystack's Transfer API only moves NGN out of the account's own
// balance).
export async function createTransferRecipient(args: {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}): Promise<PaystackTransferRecipientResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: args.accountName,
      account_number: args.accountNumber,
      bank_code: args.bankCode,
      currency: "NGN",
    }),
  });
  return res.json();
}

export async function initiateTransfer(args: {
  amountNaira: number;
  recipientCode: string;
  reason: string;
}): Promise<PaystackTransferResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(args.amountNaira * 100),
      recipient: args.recipientCode,
      reason: args.reason,
    }),
  });
  return res.json();
}

// A Paystack transfer's status at initiateTransfer() time isn't necessarily final — it can come
// back "pending" (queued for review/OTP finalization on Paystack's own side) and only resolve to
// "success"/"failed"/"reversed" sometime after. This re-checks a transfer already initiated, by
// its transfer_code, against Paystack's own current record of it — used by request-payout's
// "recheck" action so an admin can confirm whether a withdrawal actually went through rather
// than trusting whatever status was recorded at initiation.
export async function verifyPaystackTransfer(
  transferCode: string,
): Promise<PaystackTransferResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch(
    `https://api.paystack.co/transfer/verify/${encodeURIComponent(transferCode)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
  );
  if (!res.ok) {
    throw new Error(`Paystack transfer verify request failed with status ${res.status}`);
  }
  return res.json();
}

export interface PaystackBank {
  name: string;
  code: string;
  slug: string;
}

interface PaystackBankListResult {
  status: boolean;
  message: string;
  data: PaystackBank[];
}

// The full list of Nigerian banks Paystack's Transfer API can pay out to — used to populate a
// dropdown when adding a payout method, instead of a free-text "bank name" field a student could
// get subtly wrong (typos, an outdated/unsupported bank) with no way to catch it until a real
// payout attempt fails later.
export async function listBanks(): Promise<PaystackBankListResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch(
    "https://api.paystack.co/bank?country=nigeria&currency=NGN&type=nuban",
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
  );
  if (!res.ok) {
    throw new Error(`Paystack bank list request failed with status ${res.status}`);
  }
  return res.json();
}

interface PaystackResolveResult {
  status: boolean;
  message: string;
  data: { account_number: string; account_name: string; bank_id: number };
}

// Resolves the real account name straight from the bank, given an account number + bank code —
// so a student never types their own account name (a frequent source of mismatched-name transfer
// failures); it's read back from the institution itself, the same verification every Nigerian
// fintech app does before accepting a bank account.
export async function resolveAccountNumber(
  accountNumber: string,
  bankCode: string,
): Promise<PaystackResolveResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured — set it with `supabase secrets set PAYSTACK_SECRET_KEY=sk_...`",
    );
  }

  const res = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
  );
  // Paystack answers an unresolvable account number with a 4xx status, but still a real JSON
  // body ({status: false, message: "Could not resolve account name"}) — that's an expected,
  // user-facing outcome (a typo'd account number), not a system failure, so it's parsed and
  // returned like any other response rather than thrown as an error. Only a body Paystack itself
  // didn't return as JSON is treated as a real failure.
  try {
    return await res.json();
  } catch {
    throw new Error(`Paystack account resolve request failed with status ${res.status}`);
  }
}

// Verifies the raw webhook body against Paystack's HMAC-SHA512 signature header.
// Never trust a webhook payload without this check — anyone could POST a fake "success" event.
export async function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null,
) {
  if (!PAYSTACK_SECRET_KEY || !signatureHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signatureHeader;
}
