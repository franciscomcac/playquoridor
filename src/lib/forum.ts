// Forum client helpers: fetch categories/threads/posts and hydrate author
// display info (name + avatar) from the players table in a single follow-up
// query. Kept small and typed loosely to match the pragmatic style used by
// the rest of the app's client-side data code.
import { supabase } from "@/integrations/supabase/client";

export type ForumCategory = {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type ForumAuthor = {
  player_id: string | null;
  name: string;
  avatar_url: string | null;
  country: string | null;
};

export type ForumThread = {
  id: string;
  category_slug: string;
  author_id: string;
  author_player_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  author?: ForumAuthor;
};

export type ForumPost = {
  id: string;
  thread_id: string;
  author_id: string;
  author_player_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: ForumAuthor;
};

async function hydrateAuthors<T extends { author_player_id: string | null; author_id: string }>(
  rows: T[],
): Promise<(T & { author: ForumAuthor })[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.author_player_id).filter((x): x is string => !!x)),
  );
  const byId = new Map<string, ForumAuthor>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("players")
      .select("id,name,avatar_url,country")
      .in("id", ids);
    for (const p of data ?? []) {
      byId.set(p.id, {
        player_id: p.id,
        name: p.name ?? "Player",
        avatar_url: (p as { avatar_url?: string | null }).avatar_url ?? null,
        country: p.country ?? null,
      });
    }
  }
  return rows.map((r) => ({
    ...r,
    author: (r.author_player_id && byId.get(r.author_player_id)) || {
      player_id: null,
      name: "Player",
      avatar_url: null,
      country: null,
    },
  }));
}

export async function fetchCategories(): Promise<ForumCategory[]> {
  const { data, error } = await supabase
    .from("forum_categories")
    .select("slug,name,description,sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ForumCategory[];
}

export async function fetchThreadsByCategory(
  categorySlug: string,
  limit = 50,
): Promise<ForumThread[]> {
  const { data, error } = await supabase
    .from("forum_threads")
    .select("*")
    .eq("category_slug", categorySlug)
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrateAuthors((data ?? []) as ForumThread[]);
}

export async function fetchRecentThreads(limit = 8): Promise<ForumThread[]> {
  const { data, error } = await supabase
    .from("forum_threads")
    .select("*")
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrateAuthors((data ?? []) as ForumThread[]);
}

export async function fetchThread(id: string): Promise<ForumThread | null> {
  const { data, error } = await supabase
    .from("forum_threads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [hydrated] = await hydrateAuthors([data as ForumThread]);
  return hydrated ?? null;
}

export async function fetchPosts(threadId: string): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return hydrateAuthors((data ?? []) as ForumPost[]);
}

export async function currentPlayerId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", uid)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createThread(input: {
  categorySlug: string;
  title: string;
  body: string;
}): Promise<{ id: string } | { error: string }> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { error: "You must be signed in to post." };
  const pid = await currentPlayerId();
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 140) return { error: "Title must be 3–140 characters." };
  if (body.length < 1 || body.length > 8000)
    return { error: "Post body must be 1–8000 characters." };
  const { data, error } = await supabase
    .from("forum_threads")
    .insert({
      category_slug: input.categorySlug,
      title,
      body,
      author_id: uid,
      author_player_id: pid,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: data!.id as string };
}

export async function createReply(input: {
  threadId: string;
  body: string;
}): Promise<{ id: string } | { error: string }> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { error: "You must be signed in to reply." };
  const pid = await currentPlayerId();
  const body = input.body.trim();
  if (body.length < 1 || body.length > 4000) return { error: "Reply must be 1–4000 characters." };
  const { data, error } = await supabase
    .from("forum_posts")
    .insert({ thread_id: input.threadId, body, author_id: uid, author_player_id: pid })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: data!.id as string };
}

export async function deleteThread(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("forum_threads").delete().eq("id", id);
  return { error: error?.message };
}

export async function deletePost(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("forum_posts").delete().eq("id", id);
  return { error: error?.message };
}

export async function togglePinned(id: string, pinned: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from("forum_threads").update({ pinned }).eq("id", id);
  return { error: error?.message };
}

export async function toggleLocked(id: string, locked: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from("forum_threads").update({ locked }).eq("id", id);
  return { error: error?.message };
}

export async function isAdminOrMod(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
  return (data ?? []).some((r) => r.role === "admin" || r.role === "moderator");
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
