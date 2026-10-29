"use client";

import * as React from "react";
import { Copy, Loader2 } from "lucide-react";
import { companyApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const API_SCOPES = [
  "leads:read",
  "leads:write",
  "call-details:write",
  "follow-ups:read",
  "follow-ups:write",
  "site-visits:read",
  "site-visits:write",
  "webhooks:manage",
] as const;

interface CompanyApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  ipAllowlist: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

function formatWhen(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
}

export function CompanyApiKeys({ tenantId, onSecret }: { tenantId: string; onSecret?: (secret: string) => void }) {
  const { toast } = useToast();
  const [keys, setKeys] = React.useState<CompanyApiKeyRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["leads:read"]);
  const [rateLimit, setRateLimit] = React.useState("120");
  const [allowlist, setAllowlist] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [revealedKey, setRevealedKey] = React.useState("");

  const loadKeys = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await companyApi.apiKeys.list(tenantId);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to load API keys");
      setKeys(response.data.data || []);
    } catch (loadError: any) {
      setKeys([]);
      setError(loadError?.response?.data?.error || loadError?.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    setRevealedKey("");
    void loadKeys();
  }, [loadKeys]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const createKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await companyApi.apiKeys.create(tenantId, {
        name: name.trim(),
        scopes,
        rateLimitPerMinute: Number(rateLimit) || 120,
        ipAllowlist: allowlist.split(",").map((item) => item.trim()).filter(Boolean),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (!response.data?.success || !response.data.apiKey) {
        throw new Error(response.data?.error || "Failed to create API key");
      }
      setRevealedKey(response.data.apiKey);
      onSecret?.(response.data.apiKey);
      setName("");
      toast({ title: "API key created", description: "Copy it now. It will not be shown again." });
      await loadKeys();
    } catch (createError: any) {
      toast({
        title: "Could not create API key",
        description: createError?.response?.data?.error || createError?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const revokeKey = async (key: CompanyApiKeyRecord) => {
    try {
      const response = await companyApi.apiKeys.revoke(tenantId, key.id);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to revoke API key");
      toast({ title: "API key revoked" });
      await loadKeys();
    } catch (revokeError: any) {
      toast({
        title: "Could not revoke API key",
        description: revokeError?.response?.data?.error || revokeError?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const rotateKey = async (key: CompanyApiKeyRecord) => {
    try {
      const response = await companyApi.apiKeys.rotate(tenantId, key.id);
      if (!response.data?.success || !response.data.apiKey) {
        throw new Error(response.data?.error || "Failed to rotate API key");
      }
      setRevealedKey(response.data.apiKey);
      onSecret?.(response.data.apiKey);
      toast({ title: "API key rotated", description: "Copy the new key now. The previous key no longer works." });
      await loadKeys();
    } catch (rotateError: any) {
      toast({
        title: "Could not rotate API key",
        description: rotateError?.response?.data?.error || rotateError?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API Keys</CardTitle>
        <p className="text-sm text-muted-foreground">
          External systems send <code>Authorization: Bearer &lt;key&gt;</code> or <code>X-API-Key</code>. The key selects this company. The full key is shown only once.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {revealedKey && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">Copy this key now. It cannot be retrieved later.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs dark:bg-slate-950">{revealedKey}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyText(revealedKey)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRevealedKey("")}>Dismiss</Button>
            </div>
          </div>
        )}

        <form className="grid gap-3 rounded-md border p-3" onSubmit={(event) => void createKey(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Website integration" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Requests per minute</span>
              <input value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} type="number" min={1} max={10000} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Expires</span>
              <input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">IP allowlist</span>
              <input value={allowlist} onChange={(event) => setAllowlist(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Optional, comma-separated" />
            </label>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-1 text-sm font-medium">Scopes</legend>
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))}
                />
                {scope}
              </label>
            ))}
          </fieldset>
          <div>
            <Button type="submit" size="sm" disabled={saving || scopes.length === 0 || !name.trim()}>
              {saving ? "Creating..." : "Create API key"}
            </Button>
          </div>
        </form>

        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No API keys yet. Create one to let an external system call this company.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Prefix</th>
                  <th className="py-2 pr-3 font-medium">Scopes</th>
                  <th className="py-2 pr-3 font-medium">Last used</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{key.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {key.revokedAt ? "Revoked" : key.expiresAt ? `Expires ${formatWhen(key.expiresAt)}` : "No expiry"}
                        {` · ${key.rateLimitPerMinute}/min`}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{key.keyPrefix}…</td>
                    <td className="py-2 pr-3 text-xs">{key.scopes.join(", ")}</td>
                    <td className="py-2 pr-3 text-xs">{formatWhen(key.lastUsedAt)}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={Boolean(key.revokedAt)} onClick={() => void rotateKey(key)}>Rotate</Button>
                        <Button type="button" size="sm" variant="outline" disabled={Boolean(key.revokedAt)} onClick={() => void revokeKey(key)}>Revoke</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
