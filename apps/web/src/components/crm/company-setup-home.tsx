"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Settings } from "lucide-react";
import { companyApi, getSessionToken, rememberSuperadminSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface AdminChoice {
  id: string;
  name: string;
  email: string;
  profileName: string;
}

interface AccessLogEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  viewOnly: boolean;
  durationMs: number;
  superadmin: { name: string };
  actingAs: { name: string; profileName: string };
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function CompanySetupHomeButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [opening, setOpening] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [needsOverride, setNeedsOverride] = React.useState(false);
  const [admins, setAdmins] = React.useState<AdminChoice[] | null>(null);
  const [noAdmin, setNoAdmin] = React.useState(false);
  const pending = React.useRef({ viewOnly: false, adminUserId: undefined as string | undefined, confirmInactive: false });

  const open = async (viewOnly: boolean, adminUserId?: string) => {
    pending.current = { viewOnly, adminUserId, confirmInactive: pending.current.confirmInactive };
    setOpening(true);
    setNoAdmin(false);
    const original = getSessionToken();
    try {
      const response = await companyApi.impersonate(tenantId, {
        viewOnly,
        adminUserId,
        confirmInactive: pending.current.confirmInactive,
        password: password || undefined,
      });
      if (!response.data?.success || !response.data.data?.token) {
        throw new Error(response.data?.error || "Could not open this company.");
      }
      if (original) rememberSuperadminSession(original, `/admin/companies/${tenantId}`);
      window.location.assign("/home");
    } catch (error: any) {
      const data = error?.response?.data || {};
      const code = data.code as string | undefined;
      if (code === "reauth_required") {
        setNeedsPassword(true);
        toast({ title: "Password required", description: data.error || "Re-enter your password to open this company.", variant: "destructive" });
      } else if (code === "company_inactive") {
        setNeedsOverride(true);
      } else if (code === "choose_admin") {
        setAdmins(Array.isArray(data.admins) ? data.admins : []);
      } else if (code === "no_admin") {
        setNoAdmin(true);
        toast({ title: "No admin user", description: "This company has no active admin user.", variant: "destructive" });
      } else if (error?.response?.status === 403) {
        toast({ title: "Permission denied", description: data.error || "Only a Superadmin can open a company this way.", variant: "destructive" });
      } else {
        toast({ title: "Could not open company", description: data.error || error?.message || "Please try again.", variant: "destructive" });
      }
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center">
        <Button variant="outline" className="rounded-r-none" disabled={opening} onClick={() => void open(false)}>
          {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
          Setup Home
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-l-none border-l-0" aria-label="Setup Home options" disabled={opening}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void open(false)}>Open as Tenant Admin</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void open(true)}>Open as Tenant Admin (view only)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {noAdmin && (
        <Button type="button" size="sm" variant="outline" onClick={() => router.push(`/setup/general/users?tenantId=${encodeURIComponent(tenantId)}`)}>
          Create admin
        </Button>
      )}

      <AlertDialog open={needsPassword} onOpenChange={setNeedsPassword}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm it is you</AlertDialogTitle>
            <AlertDialogDescription>
              This Superadmin session is older than 15 minutes. Enter your password to open the company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            placeholder="Superadmin password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setNeedsPassword(false);
                void open(pending.current.viewOnly, pending.current.adminUserId);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={needsOverride} onOpenChange={setNeedsOverride}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This company is not active</AlertDialogTitle>
            <AlertDialogDescription>
              The company is deactivated, not started, or expired. Open it anyway? You can still exit back to this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                pending.current.confirmInactive = true;
                setNeedsOverride(false);
                void open(pending.current.viewOnly, pending.current.adminUserId);
              }}
            >
              Open anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(admins)} onOpenChange={(open) => { if (!open) setAdmins(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Login as</AlertDialogTitle>
            <AlertDialogDescription>This company has more than one admin. Choose who to open as.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            {(admins || []).map((admin) => (
              <Button
                key={admin.id}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start"
                onClick={() => {
                  setAdmins(null);
                  void open(pending.current.viewOnly, admin.id);
                }}
              >
                <span className="text-left">
                  <span className="block font-medium">{admin.profileName}</span>
                  <span className="block text-xs text-muted-foreground">{admin.name} · {admin.email}</span>
                </span>
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CompanyImpersonationPanel({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [logs, setLogs] = React.useState<AccessLogEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notify, setNotify] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      companyApi.impersonationLog(tenantId),
      companyApi.impersonationSettings(tenantId),
    ]).then(([logResponse, settingResponse]) => {
      if (!active) return;
      if (logResponse.data?.success) setLogs(logResponse.data.data || []);
      else setError(logResponse.data?.error || "Could not load the access log.");
      if (settingResponse.data?.success) setNotify(settingResponse.data.data?.notifyOnAccess !== false);
    }).catch((loadError: any) => {
      if (!active) return;
      setError(loadError?.response?.data?.error || "Could not load the access log.");
      setLogs([]);
    });
    return () => { active = false; };
  }, [tenantId]);

  const last = logs?.[0];

  const toggle = async (checked: boolean) => {
    setNotify(checked);
    setSaving(true);
    try {
      const response = await companyApi.updateImpersonationSettings(tenantId, checked);
      if (!response.data?.success) throw new Error(response.data?.error || "Could not save the setting.");
    } catch (saveError: any) {
      setNotify(!checked);
      toast({
        title: "Could not save the notice setting",
        description: saveError?.response?.data?.error || saveError?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={notify}
            disabled={saving}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <span>
            <span className="font-medium">Notify tenant admin when Superadmin accesses</span>
            <span className="block text-muted-foreground">On by default. Sends an in-app notice on the first access of each day.</span>
          </span>
        </label>
        <div>
          <p className="text-sm font-medium">Last impersonation</p>
          {logs === null && !error ? <p className="text-sm text-muted-foreground">Loading access log...</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {logs && !last ? <p className="text-sm text-muted-foreground">No Superadmin access yet.</p> : null}
          {last ? (
            <p className="text-sm text-muted-foreground">
              {last.superadmin.name} as {last.actingAs.profileName}, {formatWhen(last.startedAt)}
              {last.endedAt ? `, ${formatDuration(last.durationMs)}` : ", still open"}
              {last.viewOnly ? ", view only" : ""}
            </p>
          ) : null}
        </div>
        {logs && logs.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Superadmin access log</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Who</th>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">How long</th>
                    <th className="py-2 font-medium">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{entry.superadmin.name} as {entry.actingAs.name}</td>
                      <td className="py-2 pr-3">{formatWhen(entry.startedAt)}</td>
                      <td className="py-2 pr-3">{entry.endedAt ? formatDuration(entry.durationMs) : "Open"}</td>
                      <td className="py-2">{entry.viewOnly ? "View only" : "Full access"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
