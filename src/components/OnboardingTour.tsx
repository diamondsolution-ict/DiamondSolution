import { useEffect, useState } from "react";
import {
  X,
  Target,
  Trophy,
  Share2,
  MessageCircle,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DiamondLogo } from "@/components/DiamondLogo";

const SESSION_KEY = "ds_onboarding_shown";
const STEP_DURATION_MS = 6000;

interface Step {
  title: string;
  description: string;
  icon: typeof Target;
}

// Rewritten from the old app's OnboardingTour.tsx to describe what this app actually has —
// the old copy leaned on "$DL" asset redistribution, which has no equivalent here, and a much
// colder "institutional protocol" tone than the rest of this app's copy (Layout.tsx's sidebar
// footer, for instance). The last step ("Secure Support Channels") is now literally true —
// real chat support shipped with 20261006100000_chat.sql.
const STEPS: Step[] = [
  {
    title: "Welcome to Diamond Solution",
    description:
      "You're in. Let's take a quick look at what's here before you dive into your first set of questions.",
    icon: GraduationCap,
  },
  {
    title: "Practice every day",
    description:
      "Pick a department, work through its courses, and build a daily streak — every attempt is tracked so you can see exactly where you're improving.",
    icon: Target,
  },
  {
    title: "Climb the leaderboard",
    description:
      "Your accuracy and consistency earn you a spot on the leaderboard — see how you stack up against other scholars.",
    icon: Trophy,
  },
  {
    title: "Refer & earn",
    description:
      "Share your referral link — when someone you refer pays for a department, you earn a commission. Opt in anytime from the Refer & Earn page.",
    icon: Share2,
  },
  {
    title: "Stuck? Just ask",
    description:
      "Have a question about payments, a course, or your account? Chat with support right from the app — we'll reply there.",
    icon: MessageCircle,
  },
];

export function OnboardingTour() {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!profile) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      // Private browsing / blocked storage — just show it every time rather than crash.
    }
    if (shown) return;
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, [profile]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, STEP_DURATION_MS);
    return () => clearInterval(timer);
  }, [visible, step]);

  function finish() {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // Nothing to do — worst case it shows again next page load this session.
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/95 p-6 backdrop-blur-xl">
      <div className="diamond-mesh relative w-full max-w-md overflow-hidden rounded-[32px] border border-gold/20 bg-navy shadow-2xl">
        <button
          onClick={finish}
          className="absolute top-5 right-5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close onboarding"
        >
          <X size={16} />
        </button>

        <div className="relative flex flex-col items-center px-8 pt-10 pb-8 text-center">
          <div className="flex items-center gap-2">
            <DiamondLogo size={20} variant="white" layout="icon" />
            <span className="font-heading text-xs font-bold uppercase tracking-widest text-white/70">
              Diamond Solution
            </span>
          </div>

          <div className="diamond-gradient mt-10 flex h-20 w-20 items-center justify-center rounded-3xl border border-gold/20 shadow-lg">
            <Icon size={32} className="text-gold" />
          </div>

          <div className="mt-6 flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === step
                    ? "w-8 bg-gold"
                    : i < step
                      ? "w-2 bg-gold/40"
                      : "w-2 bg-white/15"
                }`}
              />
            ))}
          </div>

          <h2 className="mt-6 font-heading text-xl font-bold text-white">
            {current.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {current.description}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.03] px-8 py-4">
          <button
            onClick={finish}
            className="text-xs font-semibold text-slate-400 transition-colors hover:text-white"
          >
            Skip
          </button>
          <button onClick={next} className="btn-gold px-5 py-2 text-xs">
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
