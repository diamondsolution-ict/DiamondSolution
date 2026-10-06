import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Globe } from "lucide-react";
import { DiamondLogo } from "@/components/DiamondLogo";
import { useLanguage } from "@/context/LanguageContext";

// Marketing numbers, not live data — same posture as the old app's splash (FUNCTIONAL_SPEC.md
// §1). Will move to app_settings-backed real counts if that's ever wanted; not now.
const STATS = [
  { value: "5+", labelKey: "splash.departments" },
  { value: "15,000+", labelKey: "splash.questions" },
  { value: "25%", labelKey: "splash.commission" },
];

export default function Splash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, t } = useLanguage();

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
      <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-canvas-border bg-white p-1.5 shadow-md">
        <Globe size={14} className="ml-1.5 text-royal" />
        <button
          onClick={() => void setLanguage("en")}
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
            language === "en"
              ? "bg-royal text-white shadow-sm"
              : "text-text-3 hover:text-text-2"
          }`}
        >
          EN
        </button>
        <button
          onClick={() => void setLanguage("fr")}
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
            language === "fr"
              ? "bg-royal text-white shadow-sm"
              : "text-text-3 hover:text-text-2"
          }`}
        >
          FR
        </button>
      </div>

      <div className="card-luxury w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <DiamondLogo size={80} showTagline />

          <div className="my-6 h-px w-full bg-canvas-border" />

          <p className="text-base italic leading-relaxed text-text-2">
            {t("splash.tagline")}
          </p>

          <div className="mt-6 grid w-full grid-cols-3 divide-x divide-royal-border overflow-hidden rounded-2xl border border-royal-border bg-royal-soft">
            {STATS.map((s) => (
              <div key={s.labelKey} className="px-2 py-3.5 text-center">
                <p className="font-heading text-lg font-black text-royal">
                  {s.value}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-3">
                  {t(s.labelKey)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 w-full space-y-3">
            <button
              onClick={() => go("/register")}
              className="btn-primary w-full py-3.5 text-xs font-black uppercase tracking-[0.2em]"
            >
              💎 {t("splash.register")}
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => go("/login")}
              className="btn-outline w-full py-3.5 text-xs font-black uppercase tracking-[0.2em]"
            >
              {t("splash.signin")}
            </button>
          </div>

          <p className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-text-3">
            {t("splash.footer")}
          </p>
        </div>
      </div>
    </div>
  );
}
