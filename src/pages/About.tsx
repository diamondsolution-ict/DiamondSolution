// "About & Guide": what Diamond Solution is and how to use it, for students, moderators and
// admins, on the website and in the Android app. The text lives in scripts/gen-guide.py (the
// same source also generates the app's copy) — edit it there and re-run the script.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb, Smartphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import {
  GUIDE_ABOUT,
  GUIDE_AUDIENCES,
  GUIDE_PLATFORMS,
  type GuideAudience,
} from "@/lib/guideContent";

export default function About() {
  const { isAdmin, isModerator } = useAuth();
  const navigate = useNavigate();

  const visible: GuideAudience[] = GUIDE_AUDIENCES.filter(
    (a) =>
      a.id === "student" ||
      (a.id === "moderator" && (isModerator || isAdmin)) ||
      (a.id === "admin" && isAdmin),
  );
  const [active, setActive] = useState<GuideAudience["id"]>(
    visible[visible.length - 1].id,
  );
  const audience = visible.find((a) => a.id === active) ?? visible[0];

  return (
    <Layout title="About & Guide" onBack={() => navigate(-1)}>
      <div className="diamond-gradient card-luxury p-6 text-white">
        <h2 className="font-heading text-xl font-bold">{GUIDE_ABOUT.title}</h2>
        <p className="mt-1 text-sm font-semibold text-gold">
          {GUIDE_ABOUT.tagline}
        </p>
        {GUIDE_ABOUT.body.map((p) => (
          <p key={p} className="mt-3 text-sm text-white/85">
            {p}
          </p>
        ))}
      </div>

      {visible.length > 1 && (
        <div className="mt-4 inline-flex rounded-xl border border-canvas-border bg-white p-1">
          {visible.map((a) => (
            <button
              key={a.id}
              onClick={() => setActive(a.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                active === a.id ? "bg-royal text-white" : "text-text-3"
              }`}
            >
              {a.title}
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm text-text-2">{audience.intro}</p>

      <div className="mt-4 space-y-3">
        {audience.sections.map((s, i) => (
          <details
            key={s.title}
            open={i === 0}
            className="card-luxury group overflow-hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-heading text-sm font-bold text-text-1">
              {s.title}
              <span className="text-text-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="space-y-3 border-t border-canvas-border px-5 py-4">
              {s.items.map((it) => (
                <div key={it.heading}>
                  <p className="text-sm font-semibold text-text-1">
                    {it.heading}
                  </p>
                  <p className="mt-0.5 text-sm text-text-2">{it.body}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>

      <div className="card-luxury mt-4 border-gold/40 bg-gold-pale p-5">
        <p className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
          <Lightbulb size={16} className="text-gold-dark" />
          Tips to get the most out of it
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-2">
          {audience.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="card-luxury mt-4 p-5">
        <p className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
          <Smartphone size={16} className="text-royal" />
          {GUIDE_PLATFORMS.title}
        </p>
        <div className="mt-3 space-y-3">
          {GUIDE_PLATFORMS.items.map((it) => (
            <div key={it.heading}>
              <p className="text-sm font-semibold text-text-1">{it.heading}</p>
              <p className="mt-0.5 text-sm text-text-2">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
