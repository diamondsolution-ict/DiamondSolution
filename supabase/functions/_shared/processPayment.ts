// Shared by verify-payment (client-triggered) and paystack-webhook (push-based) — whichever
// reaches "success" first wins; the unique constraint on payments(provider, provider_reference)
// makes the second arrival a no-op, not a duplicate grant. Only `department_access` is
// implemented today — `suspension_reactivation` is a valid payment_purpose in the schema for
// later, but nothing in the app can suspend a user yet (that's the admin-manage-user function,
// not built in this pass), so there is deliberately no code path for it to reach here yet.
//
// Every reference that actually gets verified — success OR failure — is persisted to
// `payments`. The one thing deliberately NOT persisted is a reference that was never verified
// at all (e.g. Paystack's own API call errored before we got any definitive answer) — there's
// no real outcome to record for that, and a row claiming otherwise would mislead the admin
// transactions ledger rather than inform it.
//
// Pay-once vs pay-in-3: the client never tells the server which one it is — the server infers
// it purely from the verified Paystack amount, same "never trust a client-supplied value"
// discipline as everything else here. If no instalment plan is already in progress, a payment
// matching the full price is a full payment (unchanged from before); a payment matching
// floor(price / 3) starts a new 3-instalment plan. If a plan IS in progress, the only valid
// amount is that plan's own next instalment (locked to the price when the plan started, not
// today's price) — see department_payment_plans in
// 20261025000000_department_access_installments.sql for the full design rationale.
import { serviceClient, HttpError } from "./supabaseClients.ts";
import type { PaystackVerifyResult } from "./paystack.ts";
import { notify } from "./notify.ts";

interface ProcessArgs {
  reference: string;
  userId: string;
  departmentId: string;
  paystack: PaystackVerifyResult;
}

interface PlanRow {
  id: string;
  total_amount: number;
  currency: string;
  installment_amount: number;
  access_duration_days: number | null;
  installments_paid: number;
  started_at: string | null;
}

// Instalments 1 and 2 are the floor of price/3; instalment 3 absorbs whatever's left, so the
// three always sum to exactly the total regardless of rounding (e.g. ₦20,000 -> 6,666 / 6,666 /
// 6,668, never a penny lost or invented).
function firstInstallmentAmount(totalAmount: number): number {
  return Math.floor(totalAmount / 3);
}
// Number(...) on every field read here — Postgres numeric columns come back from PostgREST as
// strings, and a raw (unconverted) string slipping into a later .toLocaleString() call would
// silently show "5000.00" instead of "5,000" rather than error (String.prototype.toLocaleString
// is a harmless no-op, not a type error).
function amountForInstallment(
  plan: Pick<PlanRow, "total_amount" | "installment_amount">,
  installmentNumber: number,
): number {
  return installmentNumber === 3
    ? Number(plan.total_amount) - 2 * Number(plan.installment_amount)
    : Number(plan.installment_amount);
}

export async function processDepartmentAccessPayment({
  reference,
  userId,
  departmentId,
  paystack,
}: ProcessArgs) {
  const db = serviceClient();

  // Idempotency: if this reference was already recorded as a success, don't re-process —
  // just confirm the grant exists (covers the case where the webhook already landed it).
  const { data: existing } = await db
    .from("payments")
    .select("id, status")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();

  if (existing?.status === "success") {
    return { alreadyProcessed: true };
  }

  async function recordFailure(reason: string): Promise<never> {
    const row = {
      user_id: userId,
      provider: "paystack",
      provider_reference: reference,
      purpose: "department_access" as const,
      department_id: departmentId,
      // amount/currency reflect what Paystack actually reported, even on failure — the one
      // exception is a non-numeric amount (shouldn't happen, but never let a malformed value
      // violate the `amount > 0` check), which falls back to a nominal 1 rather than erroring
      // on the write itself.
      amount: paystack.data?.amount ? paystack.data.amount / 100 : 1,
      currency: paystack.data?.currency ?? "NGN",
      status: "failed" as const,
      verified_at: new Date().toISOString(),
      raw_provider_response: { ...paystack.data, _failure_reason: reason },
    };

    if (existing) {
      await db.from("payments").update(row).eq("id", existing.id);
    } else {
      await db.from("payments").insert(row);
    }
    await notify({
      db,
      userId,
      type: "payment_failed",
      title: "Payment failed",
      body: reason,
    });
    throw new HttpError(402, reason);
  }

  if (!paystack.status || paystack.data.status !== "success") {
    await recordFailure("Payment was not successful.");
  }

  // Real price, looked up server-side — never trust a client-supplied amount. "Current price"
  // is the row with the latest effective_from that isn't in the future.
  const { data: priceRow, error: priceError } = await db
    .from("department_pricing")
    .select("amount, access_duration_days")
    .eq("department_id", departmentId)
    .eq("currency", paystack.data.currency)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priceError || !priceRow) {
    await recordFailure("No price configured for this department/currency.");
    return; // unreachable — recordFailure always throws — but keeps TS's control-flow happy
  }

  // The most recent plan for this user/department, if any (there's no uniqueness constraint —
  // a student can have an old completed plan from a prior year and a fresh one for this year's
  // renewal; only the latest one is ever "in progress").
  const { data: latestPlan } = await db
    .from("department_payment_plans")
    .select(
      "id, total_amount, currency, installment_amount, access_duration_days, installments_paid, started_at",
    )
    .eq("user_id", userId)
    .eq("department_id", departmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PlanRow>();

  const planInProgress =
    latestPlan && latestPlan.installments_paid < 3 ? latestPlan : null;

  const expectedFullKobo = Math.round(Number(priceRow.amount) * 100);

  let plan: PlanRow | null = null;
  let installmentNumber: number | null = null; // null = this is a full, one-time payment
  let payAmountNaira: number;

  if (planInProgress) {
    // A plan is already running — the only amount that's ever valid now is its own next
    // instalment, locked to the price when the plan started.
    installmentNumber = planInProgress.installments_paid + 1;
    payAmountNaira = amountForInstallment(planInProgress, installmentNumber);
    const expectedKobo = Math.round(payAmountNaira * 100);
    if (paystack.data.amount !== expectedKobo) {
      await recordFailure(
        `Amount mismatch: paid ${paystack.data.amount}, expected instalment ${installmentNumber} of 3 (${expectedKobo}).`,
      );
    }
    plan = planInProgress;
  } else if (paystack.data.amount === expectedFullKobo) {
    // Full, one-time payment — exactly today's existing behavior.
    payAmountNaira = Number(priceRow.amount);
  } else {
    // Not the full price — the only other valid amount is a fresh 1st instalment.
    const firstAmount = firstInstallmentAmount(Number(priceRow.amount));
    const expectedFirstKobo = Math.round(firstAmount * 100);
    if (paystack.data.amount !== expectedFirstKobo) {
      await recordFailure(
        `Amount mismatch: paid ${paystack.data.amount}, expected either the full price (${expectedFullKobo}) or a first instalment (${expectedFirstKobo}).`,
      );
    }
    installmentNumber = 1;
    payAmountNaira = firstAmount;
    const { data: newPlan, error: newPlanError } = await db
      .from("department_payment_plans")
      .insert({
        user_id: userId,
        department_id: departmentId,
        total_amount: priceRow.amount,
        currency: paystack.data.currency,
        installment_amount: firstAmount,
        access_duration_days: priceRow.access_duration_days,
        installments_paid: 0,
      })
      .select(
        "id, total_amount, currency, installment_amount, access_duration_days, installments_paid, started_at",
      )
      .single<PlanRow>();
    if (newPlanError || !newPlan) {
      await recordFailure(
        newPlanError?.message ?? "Failed to start instalment plan.",
      );
    }
    plan = newPlan!;
  }

  const paymentRow = existing
    ? await db
        .from("payments")
        .update({
          status: "success",
          verified_at: new Date().toISOString(),
          raw_provider_response: paystack.data,
          installment_number: installmentNumber,
          payment_plan_id: plan?.id ?? null,
        })
        .eq("id", existing.id)
        .select("id")
        .single()
    : await db
        .from("payments")
        .insert({
          user_id: userId,
          provider: "paystack",
          provider_reference: reference,
          purpose: "department_access",
          department_id: departmentId,
          amount: payAmountNaira,
          currency: paystack.data.currency,
          status: "success",
          verified_at: new Date().toISOString(),
          raw_provider_response: paystack.data,
          installment_number: installmentNumber,
          payment_plan_id: plan?.id ?? null,
        })
        .select("id")
        .single();

  if (paymentRow.error || !paymentRow.data) {
    throw new HttpError(
      500,
      paymentRow.error?.message ?? "Failed to record payment.",
    );
  }

  // Access is time-limited by default now (department_pricing.access_duration_days = 365 for a
  // yearly fee; null = lifetime). Work out the new expiry against any grant the student already
  // has so that paying again never costs them anything:
  //   - an existing lifetime grant (expires_at null) stays lifetime — never downgraded to a year;
  //   - extending while still active adds the new term on top of the remaining time;
  //   - extending after it lapsed starts a fresh term from today.
  // Instalments 1 and 2 only ever extend by 30 days (a grace window to the next payment) using
  // that same "extend from whichever is later" formula. Instalment 3 is handled separately,
  // below — it does NOT reuse that formula, deliberately: chaining three 30-day extensions and
  // then tacking a full fresh term on top of wherever that lands would hand every instalment
  // payer an extra ~60 bonus days over someone who just pays in full, which was never decided
  // on. Instead the final grant is pinned to exactly one year from the plan's own first
  // payment (plan.started_at) — "your year starts when you first paid," the same way a single
  // full payment's year starts the day it's made, instalments or not.
  const { data: existingGrant } = await db
    .from("access_grants")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("department_id", departmentId)
    .maybeSingle();

  const grantIsLifetime = !!(existingGrant && existingGrant.expires_at === null);
  const planCompleting = installmentNumber === 3;

  let expiresAt: string | null = null;
  if (!grantIsLifetime) {
    if (planCompleting) {
      const durationDays = plan?.access_duration_days ?? priceRow.access_duration_days;
      const anchor = plan?.started_at
        ? new Date(plan.started_at).getTime()
        : Date.now();
      expiresAt = durationDays
        ? new Date(anchor + durationDays * 86_400_000).toISOString()
        : null;
    } else {
      const extensionDays = installmentNumber !== null ? 30 : priceRow.access_duration_days;
      if (extensionDays) {
        const now = Date.now();
        const currentEnd = existingGrant?.expires_at
          ? new Date(existingGrant.expires_at).getTime()
          : 0;
        const start = Math.max(now, currentEnd);
        expiresAt = new Date(start + extensionDays * 86_400_000).toISOString();
      }
    }
  }

  const { error: grantError } = await db.from("access_grants").upsert(
    {
      user_id: userId,
      department_id: departmentId,
      granted_via_payment_id: paymentRow.data.id,
      expires_at: expiresAt,
    },
    { onConflict: "user_id,department_id" },
  );

  if (grantError) throw new HttpError(500, grantError.message);

  // Advance the plan's own counters to match, so the next payment (if any) knows what's next
  // and the UI can show "instalment 2 of 3 due <date>" without re-deriving it.
  if (plan && installmentNumber !== null) {
    const planComplete = installmentNumber === 3;
    const { error: planUpdateError } = await db
      .from("department_payment_plans")
      .update({
        installments_paid: installmentNumber,
        started_at:
          installmentNumber === 1 ? new Date().toISOString() : undefined,
        next_due_at: planComplete ? null : expiresAt,
      })
      .eq("id", plan.id);
    if (planUpdateError) throw new HttpError(500, planUpdateError.message);
  }

  const { data: department } = await db
    .from("departments")
    .select("name")
    .eq("id", departmentId)
    .maybeSingle();

  const deptName = department?.name ?? "this department";
  let successBody: string;
  if (installmentNumber === null) {
    successBody = `Your payment for ${deptName} was confirmed — ${
      expiresAt
        ? `you have access until ${new Date(expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}.`
        : "you now have access."
    }`;
  } else if (installmentNumber < 3) {
    const nextAmount = plan ? amountForInstallment(plan, installmentNumber + 1) : null;
    successBody = `Instalment ${installmentNumber} of 3 received for ${deptName} — you have full access now. Next instalment${
      nextAmount ? ` (₦${nextAmount.toLocaleString()})` : ""
    } is due by ${new Date(expiresAt!).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}.`;
  } else {
    successBody = `Final instalment received for ${deptName} — your plan is fully paid. ${
      expiresAt
        ? `You have access until ${new Date(expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}.`
        : "You now have access."
    }`;
  }

  await notify({
    db,
    userId,
    type: "payment_success",
    title: "Payment received",
    body: successBody,
  });

  await creditReferralCommission({
    db,
    paymentId: paymentRow.data.id,
    referredUserId: userId,
    // Commission is on money actually received this transaction, not the plan's eventual
    // total — an instalment plan that's later defaulted on never should have minted commission
    // on instalments that were never paid.
    baseAmount: payAmountNaira,
    baseCurrency: paystack.data.currency,
  });

  return { alreadyProcessed: false };
}

// A configurable % of the base price (app_settings.commission_rate, admin-editable from
// Admin → Settings — see 20261013150000_affiliate_program_configurable.sql), credited only
// when the buyer was referred by a currently-active affiliate (opt-in — see
// 03-BUSINESS-RULES-REDESIGN.md §1). Silently a no-op when there's no referral or the referrer
// never activated — never blocks the payment itself.
async function creditReferralCommission({
  db,
  paymentId,
  referredUserId,
  baseAmount,
  baseCurrency,
}: {
  db: ReturnType<typeof serviceClient>;
  paymentId: string;
  referredUserId: string;
  baseAmount: number;
  baseCurrency: string;
}) {
  const { data: referral } = await db
    .from("referrals")
    .select("referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (!referral) return;

  // The affiliate program is NGN-only — a referred student paying in USD earns their referrer
  // nothing, rather than minting a commission in a currency the affiliate program no longer
  // supports (no withdrawal, payout method, or balance UI for it, and no FX rate to convert it
  // into NGN).
  if (baseCurrency !== "NGN") return;

  const { data: affiliate } = await db
    .from("affiliate_profiles")
    .select("status")
    .eq("user_id", referral.referrer_user_id)
    .maybeSingle();

  if (affiliate?.status !== "active") return;

  const { data: settings } = await db
    .from("app_settings")
    .select("commission_rate")
    .eq("id", 1)
    .maybeSingle();
  // Falls back to the long-standing 25% only if the singleton row is somehow missing — it's
  // seeded by migration and admin-only to write, so this should never actually trigger.
  const commissionRate = settings?.commission_rate ?? 0.25;

  const commissionAmount = Math.round(baseAmount * commissionRate * 100) / 100;

  // unique(payment_id) makes this safe against the same payment being processed twice
  // (webhook + client verify both landing) — the second insert just violates the constraint.
  const { error: commissionError } = await db.from("commissions").insert({
    payment_id: paymentId,
    referrer_user_id: referral.referrer_user_id,
    referred_user_id: referredUserId,
    base_amount: baseAmount,
    base_currency: baseCurrency,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    commission_currency: baseCurrency,
  });

  if (!commissionError) {
    await notify({
      db,
      userId: referral.referrer_user_id,
      type: "commission_earned",
      title: "You earned a commission",
      body: `You earned ${commissionAmount} ${baseCurrency} from a referral's payment.`,
    });
  }
}
