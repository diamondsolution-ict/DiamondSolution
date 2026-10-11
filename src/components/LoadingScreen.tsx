import { DiamondLogo } from "@/components/DiamondLogo";

// Replaces plain "Loading…" text everywhere with a gently breathing logo mark — the same
// Diamond Solution crest, scaling up and fading slightly on a loop, rather than a generic
// spinner. `full` renders a centered full-viewport screen (route guards, whole-page loads);
// without it, it's a smaller inline block for a section mid-page.
export function LoadingScreen({ full = false }: { full?: boolean }) {
  return (
    <div
      className={
        full
          ? "diamond-mesh flex min-h-screen flex-col items-center justify-center gap-3"
          : "flex flex-col items-center justify-center gap-2 py-10"
      }
    >
      <DiamondLogo
        layout="icon"
        size={full ? 48 : 32}
        className="animate-breathe"
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
        Loading…
      </p>
    </div>
  );
}
