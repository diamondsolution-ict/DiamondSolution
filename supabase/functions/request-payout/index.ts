// Admin-triggered: approves, rejects, or rechecks a withdrawal. Approval only auto-pays NGN
// bank_transfer withdrawals via Paystack's Transfer API, and only when
// app_settings.withdrawal_auto_payout_enabled is true — every other currency/method, or any
// withdrawal at all while that switch is off, has no path through this function; the admin
// settles those outside it and records the result with a direct "mark as paid" update, which
// the existing withdrawals_staff_manage RLS policy already allows without going through here.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  anonClient,
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import {
  createTransferRecipient,
  initiateTransfer,
  verifyPaystackTransfer,
} from "../_shared/paystack.ts";
import { notify } from "../_shared/notify.ts";

async function logAction(
  db: ReturnType<typeof serviceClient>,
  actorId: string,
  action: string,
  withdrawalId: string,
  reason?: string,
) {
  await db.from("admin_actions_log").insert({
    actor_user_id: actorId,
    action,
    target_table: "withdrawals",
    target_id: withdrawalId,
    reason,
  });
}

// Paystack transfer statuses: "success" and "failed"/"reversed" are final; "pending" and "otp"
// mean Paystack hasn't resolved it yet (queued for review, or needs an OTP this app never
// supplies) — recording either of those as our own "success" would tell the affiliate they were
// paid before that's actually true. Only "success" maps to our "success"; "failed"/"reversed"
// map to our "failed"; anything else (pending/otp/unrecognized) stays "pending" so it surfaces
// for a recheck later instead of silently becoming wrong in either direction.
function mapTransferStatus(paystackStatus: string | undefined): "success" | "failed" | "pending" {
  if (paystackStatus === "success") return "success";
  if (paystackStatus === "failed" || paystackStatus === "reversed") return "failed";
  return "pending";
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = await verifyUser(req);

    const authHeader = req.headers.get("Authorization")!;
    // Withdrawals is admin-only now (see 20261013200000_moderator_scope_limits.sql) — a
    // moderator never had a "Withdrawals" entry on their restricted nav in the first place.
    const { data: isAdmin } = await anonClient(authHeader).rpc("is_admin");
    if (!isAdmin) throw new HttpError(403, "Admin access required.");

    const { withdrawal_id, action, reason } = await req.json();
    if (!withdrawal_id || !["approve", "reject", "recheck"].includes(action)) {
      throw new HttpError(
        400,
        "withdrawal_id and action ('approve' | 'reject' | 'recheck') are required.",
      );
    }

    const db = serviceClient();
    const { data: withdrawal, error: fetchError } = await db
      .from("withdrawals")
      .select(
        "id, user_id, amount, currency, status, provider_reference, payout_method_id, payout_methods(method, bank_code, account_number, account_name)",
      )
      .eq("id", withdrawal_id)
      .single();

    if (fetchError || !withdrawal)
      throw new HttpError(404, "Withdrawal not found.");

    if (action === "reject") {
      if (withdrawal.status !== "pending") {
        throw new HttpError(409, `Withdrawal is already ${withdrawal.status}.`);
      }
      await db
        .from("withdrawals")
        .update({
          status: "failed",
          provider_response: {
            manual: true,
            reason: reason ?? "Rejected by admin.",
          },
          processed_at: new Date().toISOString(),
          processed_by: admin.id,
        })
        .eq("id", withdrawal_id);
      await notify({
        db,
        userId: withdrawal.user_id,
        type: "withdrawal_processed",
        title: "Withdrawal rejected",
        body: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} was rejected${reason ? `: ${reason}` : "."}`,
      });
      await logAction(
        db,
        admin.id,
        "withdrawal_rejected",
        withdrawal_id,
        reason,
      );
      return jsonResponse({ success: true, status: "failed" });
    }

    if (action === "recheck") {
      if (!withdrawal.provider_reference) {
        throw new HttpError(
          422,
          "No Paystack transfer reference recorded for this withdrawal yet — nothing to recheck.",
        );
      }
      const transfer = await verifyPaystackTransfer(withdrawal.provider_reference);
      const newStatus = mapTransferStatus(transfer.data?.status);
      const changed = newStatus !== withdrawal.status;

      if (changed) {
        await db
          .from("withdrawals")
          .update({
            status: newStatus,
            provider_response: transfer,
            processed_at: new Date().toISOString(),
            processed_by: admin.id,
          })
          .eq("id", withdrawal_id);

        if (newStatus !== "pending") {
          await notify({
            db,
            userId: withdrawal.user_id,
            type: "withdrawal_processed",
            title: newStatus === "success" ? "Withdrawal paid" : "Withdrawal failed",
            body:
              newStatus === "success"
                ? `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} was paid out.`
                : `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} failed: ${transfer.message}`,
          });
        }
        await logAction(
          db,
          admin.id,
          "withdrawal_rechecked",
          withdrawal_id,
          `${withdrawal.status} -> ${newStatus}`,
        );
      }

      return jsonResponse({
        success: true,
        paystackStatus: transfer.data?.status ?? "unknown",
        status: newStatus,
        changed,
      });
    }

    // action === "approve"
    if (withdrawal.status !== "pending") {
      throw new HttpError(409, `Withdrawal is already ${withdrawal.status}.`);
    }

    const { data: settings } = await db
      .from("app_settings")
      .select("withdrawal_auto_payout_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.withdrawal_auto_payout_enabled === false) {
      throw new HttpError(
        422,
        "Automatic payouts are switched off (Admin → Settings) — settle this withdrawal manually and record it with a direct status update.",
      );
    }

    const method = (withdrawal as { payout_methods: { method: string } | null })
      .payout_methods;
    if (withdrawal.currency !== "NGN" || method?.method !== "bank_transfer") {
      throw new HttpError(
        422,
        "Only NGN bank-transfer withdrawals can be auto-paid here — settle this one manually and record it with a direct status update.",
      );
    }

    const payoutMethod = method as unknown as {
      bank_code: string | null;
      account_number: string | null;
      account_name: string | null;
    };
    if (
      !payoutMethod.bank_code ||
      !payoutMethod.account_number ||
      !payoutMethod.account_name
    ) {
      throw new HttpError(422, "Payout method is missing bank details.");
    }

    const recipient = await createTransferRecipient({
      accountNumber: payoutMethod.account_number,
      bankCode: payoutMethod.bank_code,
      accountName: payoutMethod.account_name,
    });

    if (!recipient.status) {
      await db
        .from("withdrawals")
        .update({
          status: "failed",
          provider_response: { step: "create_recipient", ...recipient },
          processed_at: new Date().toISOString(),
          processed_by: admin.id,
        })
        .eq("id", withdrawal_id);
      await notify({
        db,
        userId: withdrawal.user_id,
        type: "withdrawal_processed",
        title: "Withdrawal failed",
        body: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} failed: ${recipient.message}`,
      });
      await logAction(
        db,
        admin.id,
        "withdrawal_payout_failed",
        withdrawal_id,
        `recipient creation: ${recipient.message}`,
      );
      throw new HttpError(
        502,
        `Paystack recipient creation failed: ${recipient.message}`,
      );
    }

    const transfer = await initiateTransfer({
      amountNaira: Number(withdrawal.amount),
      recipientCode: recipient.data.recipient_code,
      reason: "Affiliate commission payout",
    });

    const newStatus = transfer.status
      ? mapTransferStatus(transfer.data?.status)
      : "failed";
    await db
      .from("withdrawals")
      .update({
        status: newStatus,
        provider_reference: transfer.data?.transfer_code ?? null,
        provider_response: transfer,
        processed_at: new Date().toISOString(),
        processed_by: admin.id,
      })
      .eq("id", withdrawal_id);

    if (newStatus !== "pending") {
      await notify({
        db,
        userId: withdrawal.user_id,
        type: "withdrawal_processed",
        title: newStatus === "success" ? "Withdrawal paid" : "Withdrawal failed",
        body:
          newStatus === "success"
            ? `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} was paid out.`
            : `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} failed: ${transfer.message}`,
      });
    }

    await logAction(
      db,
      admin.id,
      newStatus === "success"
        ? "withdrawal_paid_via_paystack"
        : newStatus === "pending"
          ? "withdrawal_payout_pending"
          : "withdrawal_payout_failed",
      withdrawal_id,
      newStatus === "success" ? undefined : transfer.message,
    );

    if (newStatus === "failed")
      throw new HttpError(502, `Paystack transfer failed: ${transfer.message}`);

    return jsonResponse({ success: true, status: newStatus });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
