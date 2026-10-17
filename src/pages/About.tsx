import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  ShieldCheck,
  Crown,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";

interface AboutSection {
  heading: string;
  intro?: string;
  bullets?: string[];
}

type RoleKey = "student" | "moderator" | "admin";

// ============================================================================
// Content lives here, once, as data — About.tsx just renders it. Keep this the source of
// truth for what the platform actually does; the mobile app (about_screen.dart) mirrors this
// content by hand, the same way every other screen here has a hand-ported Flutter twin rather
// than a shared content file, so update both when a real feature changes.
// ============================================================================

const STUDENT_SECTIONS: AboutSection[] = [
  {
    heading: "What Diamond Solution is",
    intro:
      "An exam-prep platform built around your department (e.g. BMLS, MBBS, Nursing) and level (e.g. 200L, 300L). Each department holds courses, each course holds timed objective and application questions with explanations — built to help you revise fast and track real progress, not just scroll through notes.",
  },
  {
    heading: "Creating your account",
    bullets: [
      "Every signup needs a referral code — there are no exceptions, even for the very first account on the platform. Ask a friend who's already on the platform for theirs, or use a code an affiliate shared with you.",
      "You'll set a username, full name, and password. Your WhatsApp/phone number and university are optional but help Support reach you.",
      "Only one browser/device is treated as \"active\" per account at a time — see \"One device at a time\" below before you share your login.",
    ],
  },
  {
    heading: "Finding your department and courses",
    bullets: [
      "From Departments, pick your department, then a level (200L, 300L, …) to see that level's courses.",
      "Each course shows how many questions it has and whether you already have access.",
      "Opening a course you haven't paid for shows a \"Restricted\" screen with the price — tap Authorize payment to pay via Paystack.",
    ],
  },
  {
    heading: "Paying for access",
    bullets: [
      "You pay once per department, not per course — it unlocks every course, in every level, inside that department.",
      "Access currently runs for one year from the date you pay, shown on the course page and in Payment History. It is not lifetime access (that policy ended — see your receipt for the exact expiry date).",
      "Payments are processed by Paystack in NGN. If your profile currency is set to USD, you'll still be charged in NGN — that's just a display preference.",
    ],
  },
  {
    heading: "Studying a course",
    bullets: [
      "Objective (multiple-choice) questions give you 60 seconds; Application questions give you 120 seconds. Running out of time auto-submits what you've picked (or marks it skipped if you picked nothing).",
      "After you submit, the correct answer (or expected response for an Application question) and the explanation appear right there — read them before tapping Next.",
      "Use Jump to Qn to skip straight to a specific question number, or Resume session to continue exactly where you left off.",
      "Courses are broken into sections (an outline, e.g. \"Chapter 3: Q21–40\") — finishing one shows your score for that section before you continue.",
      "Previous lets you step back and review an already-answered question without losing your place; it never lets you re-answer it differently.",
    ],
  },
  {
    heading: "Tracking your progress",
    bullets: [
      "Dashboard shows your streak, correct-answer count, average score, and a 7-day chart of daily time spent and questions attempted (tap any bar to see that day's breakdown).",
      "Revision Center (Activity Log) lists every question you've ever attempted, with your answer, the correct one, and the explanation — the real way to revise your weak spots.",
      "Leaderboard ranks students by practice volume so you can see how you compare.",
    ],
  },
  {
    heading: "Earning through the Affiliate program",
    bullets: [
      "Your account has its own referral code (shown on the Affiliate page) — share it, and anyone who signs up with it and later pays for department access earns you a commission automatically.",
      "The Affiliate page shows your running balance and full commission history.",
      "Once your balance clears the minimum, request a withdrawal with your bank details — an admin reviews and processes it from their side.",
    ],
  },
  {
    heading: "Getting help",
    bullets: [
      "Chat connects you directly with the support/admin team inside the app — use it for payment issues, account problems, or a blocked device.",
      "Notifications (the bell icon) shows broadcast announcements from the team plus account alerts (like a reactivation confirmation).",
    ],
  },
  {
    heading: "Your account settings",
    bullets: [
      "Profile/Account Settings lets you update your display name, username, WhatsApp/phone, university, interface language (English or French), and currency display preference.",
      "Changing your password requires a one-time code sent to confirm it's really you — this protects your account even if someone else gets your session.",
      "Payment History lists every payment you've made with full receipts and each department's current access status.",
    ],
  },
  {
    heading: "One device at a time",
    bullets: [
      "Your account recognizes the browser/device you sign in from. Signing in on a 2nd device is fine — it also automatically signs you out of the first one.",
      "Signing in on a 3rd distinct device blocks the whole account. The only way back in is paying a small unlock fee, and only after the block has been active for 24 hours — waiting alone doesn't unlock it.",
      "If this happens, you'll land on a dedicated \"Device locked\" screen explaining exactly what to do — or you can reach Support/Chat, and an admin or moderator can unlock you for free.",
      "Clearing your browser data or using a different browser on the same physical device counts as a \"new\" device to this check — keep that in mind before clearing site data.",
    ],
  },
];

const MODERATOR_SECTIONS: AboutSection[] = [
  {
    heading: "What a moderator is",
    intro:
      "Staff who help run the platform day-to-day without full administrative control. You get free, unconditional access to every department's content (no payment, no device limit — those only apply to students), plus a focused set of admin tools.",
  },
  {
    heading: "What you can reach",
    bullets: [
      "Dashboard — platform-wide stats: signups, revenue, active students, recent activity.",
      "Analytics — deeper usage numbers across departments and courses.",
      "WhatsApp Numbers — every student's WhatsApp/phone number in one searchable directory, with copy-to-clipboard and CSV export, for reaching students outside the app.",
      "Affiliates — view the affiliate program's referrals and commission activity.",
      "Payments — every payment made on the platform, who made it, and its status.",
      "Notifications — send a broadcast announcement to all students at once.",
      "Quotes — curate the pool of \"quote of the day\" messages shown on the student Dashboard.",
      "Support — the student support inbox: read and reply to student chats, and unlock a student whose account is device-blocked, for free, right from there.",
    ],
  },
  {
    heading: "What you can't reach",
    bullets: [
      "Users, Departments, Courses, Questions, Media, Withdrawals, System Logs, and Settings are admin-only — the sidebar hides them for you, and even typing the URL directly redirects you back to the dashboard.",
      "In short: you help run the platform and support students, but you don't edit the question bank, change pricing, manage staff roles, or touch site-wide settings. That's deliberate — talk to an admin if one of those needs changing.",
    ],
  },
  {
    heading: "Supporting students",
    bullets: [
      "Open Support to see every student chat thread. Replying there reaches the student's in-app Chat screen directly.",
      "If a student is locked out after a 3rd device sign-in, you can unlock their account for free from the same screen — no payment needed, this is a staff privilege.",
    ],
  },
];

const ADMIN_SECTIONS: AboutSection[] = [
  {
    heading: "What an admin is",
    intro:
      "Full control over the platform: everything a moderator can do, plus staff management, the entire content catalog (departments, courses, questions), pricing, payouts, and site settings. Admin accounts also pass through an extra personal-key gate when entering the admin area, on top of the normal login.",
  },
  {
    heading: "Managing users and staff",
    bullets: [
      "Admin → Users lists every account. You can suspend or unsuspend a student (with a reason), delete an account outright, or change someone's role between student, moderator, and admin.",
      "Sensitive actions here ask you to re-enter a short step-up code first — this exists so a hijacked session alone can't suspend accounts or hand out admin access.",
    ],
  },
  {
    heading: "Managing departments and levels",
    bullets: [
      "Admin → Departments → Add department creates a new one (name, slug, image). Edit changes its name/status; Status can be set to archived to hide it from students without deleting anything.",
      "Deleting a department only works if it has zero courses, pricing history, and students attached — otherwise you'll be told to archive it instead (Edit Details → Status). This protects real student data from being silently destroyed by a delete click.",
      "Each department has its own levels (200L, 300L, …), managed from the same page — add one with a label and order, or delete one (blocked the same way if any course still uses that level).",
      "Pricing lives here too: set the NGN amount and access duration (now defaults to a full year) for each department — every price change is kept as history, so past receipts still show what a student actually paid for.",
    ],
  },
  {
    heading: "Managing courses",
    bullets: [
      "Admin → Departments → pick a department → Courses (or Admin → Courses?department=…). Add course picks a level, a question type (Objective or Application), and an optional description.",
      "Edit lets you change the title, level, question type, description, and Status (draft / published / archived). Only published courses show up for students.",
      "There is no raw \"delete\" for a course that students have already studied — instead, set Status to archived, which hides it immediately while keeping every student's progress and attempt history intact.",
      "A course nobody has ever studied yet (no recorded attempts) can be permanently deleted with the Delete button — this also removes its uploaded image from storage. Once even one student has answered a question in it, Delete is blocked and tells you to archive instead.",
    ],
  },
  {
    heading: "Managing questions",
    bullets: [
      "Open a course via Manage questions to add, edit, and reorder its questions. Objective questions get multiple-choice options with one marked correct; Application questions get an expected-answer text and an explanation.",
      "Archive (the trash icon on the Active tab) soft-removes a question — hidden from students immediately, fully recoverable from the Archived tab.",
      "From the Archived tab, Restore brings a question back, or Delete permanently removes it for good — that one truly can't be undone, so it's a second, separate click from Archive on purpose.",
      "Bulk \"Archive all\" clears every active question in a course at once, when you're replacing a whole bank rather than editing it question by question.",
      "Outline sections let you chapter a course (e.g. \"Section 2: Q21–40\") so students see section-complete milestones as they study.",
      "Admin → Questions (the top-level browser) searches across every course's questions at once, useful for finding and fixing a specific question without knowing which course it's in.",
    ],
  },
  {
    heading: "Media, payouts, and oversight",
    bullets: [
      "Admin → Pictures & Media uploads and manages the images used for department and course cards, stored in Supabase Storage.",
      "Admin → Withdrawals is where affiliate payout requests land — review a student's bank details and balance, then approve or decline the payout.",
      "Admin → System Logs records sensitive staff actions (so far: withdrawal-affecting actions and device unlocks) with who did it and when, for accountability.",
      "Admin → Settings holds the platform's public contact links (Telegram, WhatsApp, support email, Twitter, Facebook, Instagram) shown to students around the app.",
    ],
  },
  {
    heading: "The golden rule: archive vs. delete",
    intro:
      "Every content type on this platform follows the same discipline, by design — it's worth internalizing once rather than guessing per screen:",
    bullets: [
      "If real student data is attached to something (a payment, an attempt, a grant), the system will not let you hard-delete it — you'll always get a clear message telling you to archive/deactivate it instead.",
      "Archiving is reversible and hides something from students immediately. Hard-deleting is permanent and is only ever offered once nothing real depends on it anymore.",
      "This is true for departments, levels, courses, and questions alike — if a Delete button ever refuses with an error, that's the system protecting a real student's history, not a bug.",
    ],
  },
];

const ROLES: {
  key: RoleKey;
  label: string;
  icon: typeof GraduationCap;
  sections: AboutSection[];
}[] = [
  { key: "student", label: "Students", icon: GraduationCap, sections: STUDENT_SECTIONS },
  { key: "moderator", label: "Moderators", icon: ShieldCheck, sections: MODERATOR_SECTIONS },
  { key: "admin", label: "Admins", icon: Crown, sections: ADMIN_SECTIONS },
];

export default function About() {
  const navigate = useNavigate();
  const { isAdmin, isModerator } = useAuth();
  const defaultRole: RoleKey = isAdmin ? "admin" : isModerator ? "moderator" : "student";
  const [activeRole, setActiveRole] = useState<RoleKey>(defaultRole);

  const active = ROLES.find((r) => r.key === activeRole) ?? ROLES[0];

  return (
    <Layout title="About Diamond Solution" onBack={() => navigate(-1)} wide>
      <div className="card-luxury flex items-center gap-3 p-4">
        <div className="diamond-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <BookOpen size={20} className="text-white" />
        </div>
        <p className="text-sm text-text-2">
          Everything the platform does, written for the way you actually use
          it — on the website or the mobile app, the features work the same
          way. Pick a tab below for your role.
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        {ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setActiveRole(r.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
              activeRole === r.key
                ? "bg-royal text-white"
                : "bg-canvas-soft text-text-2 hover:bg-royal-soft"
            }`}
          >
            <r.icon size={15} />
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {active.sections.map((s) => (
          <details
            key={s.heading}
            className="card-luxury group overflow-hidden p-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-heading text-sm font-bold text-text-1">
              {s.heading}
              <span className="shrink-0 text-xs font-semibold text-royal group-open:hidden">
                Show
              </span>
              <span className="hidden shrink-0 text-xs font-semibold text-royal group-open:inline">
                Hide
              </span>
            </summary>
            <div className="border-t border-canvas-border px-4 pb-4 pt-3">
              {s.intro && (
                <p className="text-sm text-text-2">{s.intro}</p>
              )}
              {s.bullets && (
                <ul className={`space-y-2 text-sm text-text-2 ${s.intro ? "mt-3" : ""}`}>
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-royal" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </Layout>
  );
}
