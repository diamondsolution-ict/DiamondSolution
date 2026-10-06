// English/French i18n — scoped to the pre-auth funnel (Splash/Login/Register, the pages every
// visitor sees before deciding whether to sign up, regardless of the language a student
// studies in) and the persistent nav chrome (Layout's sidebar/bottom nav, on every
// authenticated page). Deeper page content (Dashboard cards, admin, course/question text)
// stays English-only for now — translating that honestly needs either hand-written copy or
// the old app's "translate to French" (Gemini) admin feature, neither of which is built yet;
// see 04-ROADMAP.md Phase 6 for what's left.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export type Language = "en" | "fr";

const STORAGE_KEY = "ds_language";

const translations: Record<Language, Record<string, string>> = {
  en: {
    "splash.tagline":
      '"Empowering students across West Africa to achieve academic excellence — one question at a time."',
    "splash.departments": "Departments",
    "splash.questions": "Questions",
    "splash.commission": "Commission",
    "splash.register": "Register Here",
    "splash.signin": "Sign In",
    "splash.footer": "Professional • Secured • Institutionalized",

    "login.email": "Email",
    "login.password": "Password",
    "login.signingIn": "Signing in…",
    "login.signIn": "Sign in",
    "login.staffPrompt": "Staff?",
    "login.adminSignIn": "Admin sign in",
    "login.disclaimer":
      "Diamond Solution is an independent study platform and is not affiliated with, endorsed by, or sponsored by any professional licensing or certification board.",

    "register.fullName": "Full name",
    "register.username": "Username",
    "register.institution": "Institution / University (full name)",
    "register.institutionPlaceholder": "e.g. University of Ibadan",
    "register.department": "Department",
    "register.departmentPlaceholder": "Select a department",
    "register.departmentNoMatch": "No match found.",
    "register.whatsapp": "WhatsApp number",
    "register.email": "Email",
    "register.password": "Password",
    "register.confirmPassword": "Confirm password",
    "register.creating": "Creating account…",
    "register.createAccount": "Create account",
    "register.disclaimer":
      "Diamond Solution is an independent study platform and is not affiliated with, endorsed by, or sponsored by any professional licensing or certification board.",
    "register.passwordMismatch": "Passwords do not match.",
    "register.checkEmail":
      "Check your email to confirm your account, then sign in.",

    "authtabs.signin": "Sign in",
    "authtabs.register": "Register",

    "nav.home": "Home",
    "nav.departments": "Departments",
    "nav.chats": "Chats",
    "nav.user": "User",
    "nav.admin": "Admin",
    "layout.motivation.title": "Small steps make big progress!",
    "layout.motivation.subtitle":
      "Consistency compounds — keep your streak going.",
    "common.signOut": "Sign out",
  },
  fr: {
    "splash.tagline":
      "« Nous aidons les étudiants d'Afrique de l'Ouest à exceller sur le plan académique — une question à la fois. »",
    "splash.departments": "Départements",
    "splash.questions": "Questions",
    "splash.commission": "Commission",
    "splash.register": "Inscrivez-vous",
    "splash.signin": "Se connecter",
    "splash.footer": "Professionnel • Sécurisé • Institutionnalisé",

    "login.email": "E-mail",
    "login.password": "Mot de passe",
    "login.signingIn": "Connexion…",
    "login.signIn": "Se connecter",
    "login.staffPrompt": "Personnel ?",
    "login.adminSignIn": "Connexion administrateur",
    "login.disclaimer":
      "Diamond Solution est une plateforme d'études indépendante qui n'est affiliée, approuvée ou parrainée par aucun ordre professionnel ou organisme de certification.",

    "register.fullName": "Nom complet",
    "register.username": "Nom d'utilisateur",
    "register.institution": "Établissement / Université (nom complet)",
    "register.institutionPlaceholder": "ex. Université d'Ibadan",
    "register.department": "Département",
    "register.departmentPlaceholder": "Sélectionnez un département",
    "register.departmentNoMatch": "Aucun résultat trouvé.",
    "register.whatsapp": "Numéro WhatsApp",
    "register.email": "E-mail",
    "register.password": "Mot de passe",
    "register.confirmPassword": "Confirmer le mot de passe",
    "register.creating": "Création du compte…",
    "register.createAccount": "Créer un compte",
    "register.disclaimer":
      "Diamond Solution est une plateforme d'études indépendante qui n'est affiliée, approuvée ou parrainée par aucun ordre professionnel ou organisme de certification.",
    "register.passwordMismatch": "Les mots de passe ne correspondent pas.",
    "register.checkEmail":
      "Consultez votre e-mail pour confirmer votre compte, puis connectez-vous.",

    "authtabs.signin": "Se connecter",
    "authtabs.register": "S'inscrire",

    "nav.home": "Accueil",
    "nav.departments": "Départements",
    "nav.chats": "Discussions",
    "nav.user": "Profil",
    "nav.admin": "Admin",
    "layout.motivation.title": "Les petits pas mènent loin !",
    "layout.motivation.subtitle": "La régularité paie — continuez votre série.",
    "common.signOut": "Déconnexion",
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "fr" ? "fr" : "en";
    } catch {
      return "en";
    }
  });

  // Reconcile from the profile once it loads (covers "switched language on another device") —
  // only runs when profile.language itself changes, not on every local setLanguage() call, so
  // it can't race a just-made local change back to a stale value.
  useEffect(() => {
    if (profile?.language && profile.language !== language) {
      setLanguageState(profile.language);
      try {
        localStorage.setItem(STORAGE_KEY, profile.language);
      } catch {
        // Private browsing / blocked storage — language still works for this session.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.language]);

  async function setLanguage(lang: Language) {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Nothing to do — worst case it resets to English next visit.
    }
    if (user) {
      await supabase
        .from("profiles")
        .update({ language: lang })
        .eq("user_id", user.id);
    }
  }

  function t(key: string): string {
    return translations[language][key] ?? translations.en[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx)
    throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
