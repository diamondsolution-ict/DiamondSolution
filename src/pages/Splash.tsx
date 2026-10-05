import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Globe } from "lucide-react";
import { DiamondLogo } from "@/components/DiamondLogo";

// Marketing numbers, not live data — same posture as the old app's splash (FUNCTIONAL_SPEC.md
// §1). Will move to app_settings-backed real counts if that's ever wanted; not now.
const STATS = [
  { value: "5+", label: "Departments" },
  { value: "15,000+", label: "Questions" },
  { value: "25%", label: "Commission" },
];

export default function Splash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) sessionStorage.setItem("referralCode", ref);
  }, [searchParams]);

  function go(path: string) {
    const ref =
      searchParams.get("ref") ?? sessionStorage.getItem("referralCode");
    navigate(ref ? `${path}?ref=${ref}` : path);
  }

  return (
    <div className="diamond-mesh relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* English-only for now — i18n (Phase 6) hasn't been built yet, so FR is a placeholder,
          not a working switch. */}
      <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-canvas-border bg-white p-1.5 shadow-md">
        <Globe size={14} className="ml-1.5 text-royal" />
        <span className="rounded-full bg-royal px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
          EN
        </span>
        <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-text-3">
          FR
        </span>
      </div>

      <div className="card-luxury w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <DiamondLogo size={80} showTagline />

          <div className="my-6 h-px w-full bg-canvas-border" />

          <p className="text-base italic leading-relaxed text-text-2">
            "Empowering students across West Africa to achieve academic
            excellence — one question at a time."
          </p>

          <div className="mt-6 grid w-full grid-cols-3 divide-x divide-royal-border overflow-hidden rounded-2xl border border-royal-border bg-royal-soft">
            {STATS.map((s) => (
              <div key={s.label} className="px-2 py-3.5 text-center">
                <p className="font-heading text-lg font-black text-royal">
                  {s.value}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-3">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 w-full space-y-3">
            <button
              onClick={() => go("/register")}
              className="btn-primary w-full py-3.5 text-xs font-black uppercase tracking-[0.2em]"
            >
              💎 Register Here
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => go("/login")}
              className="btn-outline w-full py-3.5 text-xs font-black uppercase tracking-[0.2em]"
            >
              Sign In
            </button>
          </div>

          <p className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-text-3">
            Professional • Secured • Institutionalized
          </p>
        </div>
      </div>
    </div>
  );
}
