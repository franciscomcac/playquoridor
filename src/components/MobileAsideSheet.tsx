import { useEffect, useState, type ReactNode } from "react";

type Props = {
  /** Chat panel rendered separately so a dedicated Chat button can open it. */
  chat?: ReactNode;
  /** Optional unread-message count shown as a badge on the Chat button. */
  chatUnread?: number;
  /** Everything else the aside contained (score, players, history, actions…). */
  children: ReactNode;
};

/**
 * Renders like a normal side column on `lg` and above, and collapses into
 * two bottom-sheet buttons ("Match panel" and "Chat") on smaller screens
 * so mobile users get the full board without a huge scrolling side panel.
 */
export function MobileAsideSheet({ chat, chatUnread = 0, children }: Props) {
  const [sheet, setSheet] = useState<null | "panels" | "chat">(null);

  useEffect(() => {
    if (sheet === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <>
      {/* Desktop: normal aside column */}
      <aside className="order-2 hidden min-w-0 flex-col gap-3 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
        {children}
        {chat}
      </aside>

      {/* Mobile FAB bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2 border-t border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
        <button
          onClick={() => setSheet(sheet === "panels" ? null : "panels")}
          className={
            "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-widest " +
            (sheet === "panels"
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-card text-foreground hover:bg-secondary")
          }
          aria-expanded={sheet === "panels"}
        >
          Match panel
        </button>
        {chat && (
          <button
            onClick={() => setSheet(sheet === "chat" ? null : "chat")}
            className={
              "relative flex-1 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-widest " +
              (sheet === "chat"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-foreground hover:bg-secondary")
            }
            aria-expanded={sheet === "chat"}
          >
            Chat
            {chatUnread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Bottom sheet */}
      {sheet !== null && (
        <div className="fixed inset-0 z-40 lg:hidden" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheet(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-3 shadow-2xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                {sheet === "chat" ? "Chat" : "Match panel"}
              </p>
              <button
                onClick={() => setSheet(null)}
                className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-3">{sheet === "chat" ? chat : children}</div>
          </div>
        </div>
      )}
    </>
  );
}
