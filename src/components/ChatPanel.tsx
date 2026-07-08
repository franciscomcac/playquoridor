import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLAYER_COLORS } from "@/components/QuoridorBoard";
import { play } from "@/lib/sound";
import type { PlayerId } from "@/lib/quoridor";

export type ChatEntry = {
  key: string;
  slot: number | null; // null = system message
  name: string;
  text: string;
  ts: number;
};

type Props = {
  entries: ChatEntry[];
  onSend: (text: string) => void;
  disabled?: boolean;
  you: PlayerId | null;
};

export function ChatPanel({ entries, onSend, disabled, you }: Props) {
  const [draft, setDraft] = useState("");
  const [canChat, setCanChat] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      const signedIn = !!u && !(u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous");
      if (alive) setCanChat(signedIn);
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim().slice(0, 240);
    if (!t || !canChat || disabled) return;
    onSend(t);
    setDraft("");
    play("click");
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Chat</p>
        <p className="text-[10px] text-muted-foreground">{entries.length} msg{entries.length === 1 ? "" : "s"}</p>
      </div>
      <div
        ref={scrollRef}
        className="mt-2 flex h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2 text-xs"
      >
        {entries.length === 0 && (
          <p className="m-auto text-muted-foreground">No messages yet</p>
        )}
        {entries.map((m) => {
          if (m.slot === null) {
            return (
              <p key={m.key} className="text-[10px] italic text-muted-foreground">{m.text}</p>
            );
          }
          const color = PLAYER_COLORS[m.slot as PlayerId] ?? "var(--muted-foreground)";
          const mine = you !== null && m.slot === you;
          return (
            <p key={m.key} className="leading-snug">
              <span className="font-semibold" style={{ color }}>{m.name}{mine ? " (you)" : ""}:</span>{" "}
              <span className="text-foreground/90">{m.text}</span>
            </p>
          );
        })}
      </div>
      {canChat === false ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <a href="/auth" className="underline underline-offset-2 text-primary hover:text-primary/80">Sign in</a> to use chat.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <input
            type="text"
            value={draft}
            maxLength={240}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={disabled ? "Chat unavailable" : "Say something…"}
            disabled={disabled || !canChat}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || !canChat || draft.trim().length === 0}
            className="rounded-md bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}