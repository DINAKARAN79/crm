"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leadStatusSettingsApi } from "@/lib/api";

type LeadStatusSetting = { statusId: string; status: string; label: string; enabled: boolean };

export default function CompanySettingsPage() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const [leadStatuses, setLeadStatuses] = React.useState<LeadStatusSetting[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    leadStatusSettingsApi.get().then((response) => {
      const statuses = response.data?.data;
      if (!Array.isArray(statuses)) throw new Error("Unable to load lead status settings.");
      setLeadStatuses(statuses);
    }).catch((cause: any) => {
      setError(cause?.response?.data?.error || cause?.message || "Unable to load lead status settings.");
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (new Set(leadStatuses.map((status) => status.statusId)).size !== leadStatuses.length) {
      setError("Status IDs must be unique.");
      return;
    }
    if (leadStatuses.some((status) => !status.label.trim())) {
      setError("Every status must have a label, including disabled statuses.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await leadStatusSettingsApi.update(leadStatuses.map((status) => ({
        ...status,
        label: status.label.trim(),
      })));
      const savedStatuses = response.data?.data;
      if (!Array.isArray(savedStatuses)) throw new Error("The server returned invalid lead status settings.");
      setLeadStatuses(savedStatuses);
      setMessage("Lead status settings saved.");
    } catch (cause: any) {
      setError(cause?.response?.data?.error || cause?.message || "Unable to save lead status settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={tenantId ? `/setup?tenantId=${encodeURIComponent(tenantId)}` : "/setup"}
          aria-label="Back to Setup"
          className="text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-sm text-muted-foreground">Setup / General</p>
          <h1 className="text-xl font-semibold tracking-tight">Lead Statuses</h1>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-6">
          <h2 className="font-semibold">Lead Status Configuration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set the labels your company uses for each fixed workflow status ID. IDs stay stable so
            existing leads and workflow history are not reinterpreted.
          </p>
        </div>

        <div className="space-y-4 p-6">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}

          {loading ? (
            <p className="py-8 text-sm text-muted-foreground">Loading lead status settings...</p>
          ) : leadStatuses.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">No lead status settings are available.</p>
          ) : (
            <div className="max-w-3xl overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3">Backend Status ID</th>
                    <th className="px-4 py-3">Company-Defined Label</th>
                    <th className="px-4 py-3">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {leadStatuses.map((status, index) => (
                    <tr key={status.statusId} className="border-t">
                      <td className="px-4 py-3 font-mono">{status.statusId}</td>
                      <td className="px-4 py-3">
                        <Input
                          aria-label={`Label for status ${status.statusId}`}
                          maxLength={80}
                          value={status.label}
                          onChange={(event) => {
                            setLeadStatuses((current) => current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: event.target.value } : item,
                            ));
                            setMessage("");
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Enable status ${status.statusId}`}
                          type="checkbox"
                          checked={status.enabled}
                          onChange={(event) => {
                            setLeadStatuses((current) => current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, enabled: event.target.checked } : item,
                            ));
                            setMessage("");
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The workflow uses seven fixed status IDs. A status currently used by leads cannot be disabled.
          </p>
        </div>

        <footer className="flex items-center justify-end border-t bg-muted/10 px-6 py-4">
          <Button onClick={save} disabled={loading || saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Lead Statuses"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
