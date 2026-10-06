import { Link } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

export function AuthTabs({ active }: { active: "signin" | "register" }) {
  const { t } = useLanguage();
  return (
    <div className="mb-4 flex border-b border-canvas-border">
      <Link
        to="/login"
        className={`flex-1 pb-3 text-center text-sm font-semibold transition-colors ${
          active === "signin"
            ? "border-b-2 border-royal text-royal"
            : "text-text-3 hover:text-text-2"
        }`}
      >
        {t("authtabs.signin")}
      </Link>
      <Link
        to="/register"
        className={`flex-1 pb-3 text-center text-sm font-semibold transition-colors ${
          active === "register"
            ? "border-b-2 border-royal text-royal"
            : "text-text-3 hover:text-text-2"
        }`}
      >
        {t("authtabs.register")}
      </Link>
    </div>
  );
}
