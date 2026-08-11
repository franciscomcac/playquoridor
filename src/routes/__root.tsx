import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";

import appCss from "@/styles.css?url";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { ensureAuthSession, linkAuthToPlayer } from "@/lib/identity";
import { supabase } from "@/integrations/supabase/client";
import { play, initSoundOnGesture } from "@/lib/sound";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:site_name", content: "playquoridor.online" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-adsense-account", content: "ca-pub-3338454453132935" },
      { title: "Quoridor Online — Play now, free" },
      { property: "og:title", content: "Quoridor Online — Play now, free" },
      { name: "twitter:title", content: "Quoridor Online — Play now, free" },
      { name: "description", content: "Play Quoridor free in your browser. Quick match, private rooms, 4-player free-for-alls, bot practice. No download, no signup." },
      { property: "og:description", content: "Play Quoridor free in your browser. Quick match, private rooms, 4-player free-for-alls, bot practice. No download, no signup." },
      { name: "twitter:description", content: "Play Quoridor free in your browser. Quick match, private rooms, 4-player free-for-alls, bot practice. No download, no signup." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/G0936umxfkP8XUxHjCHkuY6oOfS2/social-images/social-1783523351464-Screenshot_2026-07-08_152511.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/G0936umxfkP8XUxHjCHkuY6oOfS2/social-images/social-1783523351464-Screenshot_2026-07-08_152511.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "playquoridor.online",
          url: "https://playquoridor.online",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Ensure a Supabase session exists (anonymous by default) so every write
    // is authenticated under the new RLS. Link the auth uid to the local
    // player row once we have one.
    void ensureAuthSession().then(() => { void linkAuthToPlayer(); });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void linkAuthToPlayer();
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // Global click SFX on any <button> (unless it opts out via data-no-sound).
  // Silent for disabled buttons and pointer events on non-buttons.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      initSoundOnGesture();
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const btn = t.closest("button, [role='button']") as HTMLButtonElement | null;
      if (!btn) return;
      if (btn.hasAttribute("data-no-sound")) return;
      if (btn.disabled) return;
      play("click");
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
