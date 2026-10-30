"use client";

import Link from "next/link";
import { useActiveUsers } from "@/components/crm/use-active-users";

export function ActiveUsersCard() {
  const { payload, status } = useActiveUsers();
  const online = payload?.onlineCount ?? 0;
  const total = payload?.totalUsers ?? 0;
  const live = status === "live";
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">Active Users</p>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${live ? "text-emerald-700" : "text-slate-500"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
          {live ? "Live" : "Reconnecting..."}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{online}</p>
      <p className="text-sm text-slate-600">{online} of {total} users online</p>
      {payload?.byProfile && payload.byProfile.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {payload.byProfile.map((row: { profile: string; count: number }) => `${row.profile} ${row.count}`).join(" · ")}
        </p>
      )}
      <Link href="/setup/general/users/active-sessions" className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
        View active sessions
      </Link>
    </div>
  );
}
