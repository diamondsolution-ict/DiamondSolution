// Public privacy policy + account-deletion instructions. Google Play requires a reachable
// privacy-policy URL for the app listing (and a way to ask for account deletion), so this page
// is deliberately outside every auth guard.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { DiamondLogo } from "@/components/DiamondLogo";

export default function Privacy() {
  const [supportEmail, setSupportEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("institutional_links")
      .select("support_email")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => setSupportEmail(data?.support_email ?? null));
  }, []);

  const contact = supportEmail ? (
    <a className="font-semibold text-royal hover:underline" href={`mailto:${supportEmail}`}>
      {supportEmail}
    </a>
  ) : (
    <>our Support chat inside the app</>
  );

  return (
    <div className="diamond-mesh min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-center">
          <DiamondLogo layout="horizontal" size={30} />
        </div>
        <div className="card-luxury mt-6 space-y-5 p-6 text-sm leading-relaxed text-text-2">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text-1">Privacy Policy</h1>
            <p className="mt-1 text-text-3">Diamond Solution — website and Android app</p>
          </div>

          <section>
            <h2 className="font-heading text-base font-bold text-text-1">What we collect</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Account details you give us: name, username, email, phone / WhatsApp number, university and department.</li>
              <li>Your study activity: questions attempted, scores, progress and time spent, used for your dashboard and the leaderboard.</li>
              <li>Payment records: amount, status and reference of each payment. Card details are entered on Paystack and never reach or get stored by us.</li>
              <li>Messages you send to Support.</li>
              <li>A device identifier, used only to enforce one signed-in device per account, and basic page-visit counts.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-bold text-text-1">How we use it</h2>
            <p className="mt-1">
              To run your account and study progress, unlock the departments you paid for, process
              affiliate commissions and withdrawals, answer Support messages, send in-app
              notifications, prevent account sharing and fraud, and understand how the platform is used.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-bold text-text-1">Who we share it with</h2>
            <p className="mt-1">
              We don't sell your data. It is processed by the services that run the platform:
              Supabase (database and sign-in), Paystack (payments), and our hosting provider. Your
              name and university may appear to other students on the leaderboard. Our admins and
              moderators can see account and payment information needed to support you.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-bold text-text-1">Keeping it safe</h2>
            <p className="mt-1">
              Data travels over encrypted connections and access is restricted by role. No system is
              perfectly secure, so please choose a strong password and don't share your account.
            </p>
          </section>

          <section id="delete-account">
            <h2 className="font-heading text-base font-bold text-text-1">Deleting your account and data</h2>
            <p className="mt-1">
              To delete your account, message us from {contact} (or email us from the address on your
              account) with the subject "Delete my account". We verify it's you, then permanently
              delete your account and personal data. Payment and commission records we must keep for
              accounting are retained without your personal profile.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-bold text-text-1">Contact</h2>
            <p className="mt-1">Questions about this policy: {contact}.</p>
          </section>

          <p className="text-xs text-text-3">Last updated: October 2026.</p>
        </div>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-semibold text-royal hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
