import { createFileRoute, redirect } from "@tanstack/react-router";

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const Route = createFileRoute("/puzzle/")({
  beforeLoad: () => {
    throw redirect({ to: "/puzzle/$date", params: { date: todayISO() } });
  },
  component: () => null,
});
