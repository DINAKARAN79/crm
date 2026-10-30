"use client";

import * as React from "react";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type OwnSession = {
  id: string;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export default function MySessionsPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<OwnSession[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const response = await authApi.sessions();
      setSessions(response.data.data || []);
    } catch {
      toast({ title: "Could not load sessions", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const endSession = async (session: OwnSession) => {
    try {
      await authApi.endSession(session.id);
      if (session.current) {
        window.location.replace("/login");
        return;
      }
      toast({ title: "Device logged out" });
      await load();
    } catch {
      toast({ title: "Could not log out that device", variant: "destructive" as any });
    }
  };

  const endOthers = async () => {
    const others = sessions.filter((session) => !session.current);
    if (others.length === 0) return;
    try {
      await Promise.all(others.map((session) => authApi.endSession(session.id)));
      toast({ title: "Other devices logged out" });
      await load();
    } catch {
      toast({ title: "Could not log out the other devices", variant: "destructive" as any });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">My Profile</p>
          <h1 className="text-xl font-semibold">Sessions</h1>
        </div>
        <Button variant="outline" onClick={endOthers} disabled={sessions.filter((session) => !session.current).length === 0}>
          Log out all other devices
        </Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading sessions…</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Browser</th>
                <th className="px-3 py-2">OS</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Signed in</th>
                <th className="px-3 py-2">Last active</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t">
                  <td className="px-3 py-2">
                    {session.browser || "Browser"}
                    {session.current ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">This device</span> : null}
                  </td>
                  <td className="px-3 py-2">{session.os || "—"}</td>
                  <td className="px-3 py-2">{session.ipAddress || "—"}</td>
                  <td className="px-3 py-2">{new Date(session.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(session.lastSeenAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => endSession(session)}>
                      Log out this device
                    </Button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No other active sessions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
