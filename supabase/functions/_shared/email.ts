// Resend wrapper — the email-delivery provider chosen to unblock the OTP/step-up flow (see
// 20261005090000_security_otp_and_reactivation.sql). A thin fetch wrapper, same shape as
// paystack.ts, so swapping providers later only means rewriting this one file.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error(
      "RESEND_API_KEY / RESEND_FROM_EMAIL are not configured — set them with `supabase secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL=...`",
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed with status ${res.status}: ${body}`);
  }
}
