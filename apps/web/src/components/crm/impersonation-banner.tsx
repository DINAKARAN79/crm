"use client";

import * as React from "react";
import { impersonationApi, restoreSuperadminSession } from "@/lib/api";

interface ImpersonationStatus {
  active: boolean;
  tenantName?: string;
  actingAsName?: string;
  profileName?: string;
  viewOnly?: boolean;
  expiresAt?: string | null;
  hardExpiresAt?: string;
  returnPath?: string;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const [status, setStatus] = React.useState<ImpersonationStatus | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [exiting, setExiting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await impersonationApi.status();
      if (response.data?.success) setStatus(response.data.data as ImpersonationStatus);
    } catch {
      setStatus(null);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  if (!status?.active) return null;
  const ends = [status.expiresAt, status.hardExpiresAt]
    .map((value) => value ? new Date(value).getTime() : Number.POSITIVE_INFINITY)
    .reduce((soonest, value) => Math.min(soonest, value), Number.POSITIVE_INFINITY);
  const remaining = Number.isFinite(ends) ? formatRemaining(ends - now) : "";

  const exit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      const response = await impersonationApi.exit();
      const token = response.data?.data?.token as string | undefined;
      const returnPath = (response.data?.data?.returnPath as string | undefined) || status.returnPath || "/admin/companies";
      restoreSuperadminSession(token);
      window.location.assign(returnPath);
    } catch {
      setExiting(false);
    }
  };

  return (
    <div
      className="sticky top-0 z-40 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-950 bg-amber-400 px-3 py-2 text-[13px] font-medium text-neutral-950 print:hidden"
      role="status"
    >
      <span>
        You are viewing {status.tenantName} as {status.actingAsName || status.profileName} (Superadmin session)
        {status.viewOnly ? " · View only" : ""}
        {remaining ? ` · Time left ${remaining}` : ""}
      </span>
      <button
        type="button"
        className="rounded-md border border-neutral-950 bg-neutral-950 px-3 py-1 text-white hover:bg-neutral-800 disabled:opacity-60"
        onClick={() => void exit()}
        disabled={exiting}
      >
        {exiting ? "Exiting..." : "Exit to Superadmin"}
      </button>
    </div>
  );
}
