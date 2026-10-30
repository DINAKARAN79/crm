"use client";

export function LoggedInBadge({
  online,
  lastSeenAt,
}: {
  online: boolean;
  lastSeenAt?: string | Date | null;
}) {
  const label = online ? "Online" : "Offline";
  const seen = lastSeenAt ? new Date(lastSeenAt) : null;
  const title = seen && !Number.isNaN(seen.getTime())
    ? `${label}. Last seen ${seen.toLocaleString()}`
    : label;
  return (
    <span
      role="img"
      aria-label={label}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        online ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`} />
      {online ? "ON" : "OFF"}
    </span>
  );
}
