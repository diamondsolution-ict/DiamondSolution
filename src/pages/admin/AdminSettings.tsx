import { useEffect, useState, type FormEvent } from "react";
import {
  Facebook,
  Instagram,
  Mail,
  MessageCircle,
  Save,
  Send,
  Settings,
  Twitter,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";

interface Links {
  telegram: string;
  whatsapp: string;
  facebook: string;
  twitter: string;
  instagram: string;
  support_email: string;
}

const EMPTY_LINKS: Links = {
  telegram: "",
  whatsapp: "",
  facebook: "",
  twitter: "",
  instagram: "",
  support_email: "",
};

const FIELDS: {
  key: keyof Links;
  label: string;
  placeholder: string;
  icon: LucideIcon;
}[] = [
  {
    key: "telegram",
    label: "Telegram Handle",
    placeholder: "@diamondsolution",
    icon: Send,
  },
  {
    key: "whatsapp",
    label: "WhatsApp Interface",
    placeholder: "+2348012345678",
    icon: MessageCircle,
  },
  {
    key: "support_email",
    label: "Support Email Archive",
    placeholder: "support@diamondsolution.com",
    icon: Mail,
  },
  {
    key: "twitter",
    label: "Twitter (X) Command",
    placeholder: "@diamondsolution",
    icon: Twitter,
  },
  {
    key: "facebook",
    label: "Facebook Network",
    placeholder: "facebook.com/diamondsolution",
    icon: Facebook,
  },
  {
    key: "instagram",
    label: "Instagram Feed",
    placeholder: "@diamondsolution",
    icon: Instagram,
  },
];

export default function AdminSettings() {
  const { user } = useAuth();
  const [links, setLinks] = useState<Links>(EMPTY_LINKS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("institutional_links")
      .select("telegram, whatsapp, facebook, twitter, instagram, support_email")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      setLinks({
        telegram: data.telegram ?? "",
        whatsapp: data.whatsapp ?? "",
        facebook: data.facebook ?? "",
        twitter: data.twitter ?? "",
        instagram: data.instagram ?? "",
        support_email: data.support_email ?? "",
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);

    const payload = Object.fromEntries(
      Object.entries(links).map(([k, v]) => [k, v.trim() || null]),
    );
    const { error: updateError } = await supabase
      .from("institutional_links")
      .update({ ...payload, updated_by: user?.id })
      .eq("id", 1);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setInfo("Settings saved.");
  }

  return (
    <AdminLayout>
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-text-1">
        <Settings size={22} className="text-royal" />
        Settings
      </h1>
      <p className="mt-1 text-sm text-text-3">
        Contact links shown across the public-facing site.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-text-3">Loading…</p>
      ) : (
        <form onSubmit={save} className="card-luxury mt-6 space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                  <f.icon size={13} className="text-text-3" />
                  {f.label}
                </label>
                <input
                  value={links[f.key]}
                  onChange={(e) =>
                    setLinks((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                />
              </div>
            ))}
          </div>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={15} />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </AdminLayout>
  );
}
