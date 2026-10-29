"use client";

import * as React from "react";
import { Copy, Loader2 } from "lucide-react";
import { companyApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const PRIVATE_WARNING = "This URL is not reachable from outside. Open this page from your public domain, or set PUBLIC_API_BASE_URL, before giving it to a telecom provider.";

export interface PublicBaseUrl {
  baseUrl: string;
  source: "env" | "request" | "rejected";
  privateHost: boolean;
  warning: string | null;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt?: string | null;
}

interface TelephonyConnection {
  id: string;
  name: string;
  keyPrefix: string;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  revokedAt?: string | null;
}

const SAMPLE_WEBHOOK = {
  callerNumber: "+919000000000",
  calledNumber: "+918000000000",
  agent: "Agent 1",
  callId: "call-1001",
  callStatus: "completed",
  duration: 42,
  recordingUrl: "https://example.com/recording.mp3",
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function CompanyConnection({
  tenantId,
  companyName,
  base,
  keys,
  secret,
  leadExample,
  onCreateKey,
}: {
  tenantId: string;
  companyName: string;
  base: PublicBaseUrl;
  keys: ApiKeyRecord[];
  secret: string;
  leadExample: Record<string, unknown>;
  onCreateKey: () => void;
}) {
  const { toast } = useToast();
  const activeKeys = keys.filter((key) => !key.revokedAt);
  const [keyId, setKeyId] = React.useState(activeKeys[0]?.id || "");
  const [connections, setConnections] = React.useState<TelephonyConnection[]>([]);
  const [integrationKey, setIntegrationKey] = React.useState("");
  const [name, setName] = React.useState("Telephony");
  const [allowlist, setAllowlist] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [probe, setProbe] = React.useState("");
  const [testResult, setTestResult] = React.useState("");
  const providerCopyDisabled = base.privateHost || !base.baseUrl;
  const selectedKey = activeKeys.find((key) => key.id === keyId) || activeKeys[0];
  const activeConnection = connections.find((item) => !item.revokedAt) || null;
  const leadUrl = base.baseUrl ? `${base.baseUrl}/api/leads` : "";
  const webhookUrl = base.baseUrl && integrationKey
    ? `${base.baseUrl}/api/integrations/telephony/${integrationKey}/lead`
    : "";
  const keyLabel = secret ? "the key shown when you created it" : selectedKey ? selectedKey.keyPrefix : "<API key>";
  const curl = leadUrl
    ? `curl -X POST '${leadUrl}' \\\n  -H 'Authorization: Bearer ${secret || "<API key>"}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(leadExample)}'`
    : "";

  const load = React.useCallback(async () => {
    const response = await companyApi.telephony.list(tenantId);
    setConnections((response.data?.data || []) as TelephonyConnection[]);
  }, [tenantId]);

  React.useEffect(() => {
    void load().catch(() => setConnections([]));
  }, [load]);

  const firstKeyId = activeKeys[0]?.id || "";
  React.useEffect(() => {
    if (!keyId && firstKeyId) setKeyId(firstKeyId);
  }, [firstKeyId, keyId]);

  const copyText = async (text: string, forProvider: boolean) => {
    if (forProvider && providerCopyDisabled) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const saveConnection = async (action: "create" | "rotate" | "revoke") => {
    setBusy(action);
    setTestResult("");
    try {
      if (action === "create") {
        const ips = allowlist.split(",").map((item) => item.trim()).filter(Boolean);
        const response = await companyApi.telephony.create(tenantId, { name: name || "Telephony", ipAllowlist: ips });
        if (!response.data?.success || !response.data.integrationKey) throw new Error(response.data?.error || "Could not create the connection");
        setIntegrationKey(response.data.integrationKey);
      } else if (activeConnection && action === "rotate") {
        const response = await companyApi.telephony.rotate(tenantId, activeConnection.id);
        if (!response.data?.success || !response.data.integrationKey) throw new Error(response.data?.error || "Could not rotate the connection");
        setIntegrationKey(response.data.integrationKey);
      } else if (activeConnection && action === "revoke") {
        const response = await companyApi.telephony.revoke(tenantId, activeConnection.id);
        if (!response.data?.success) throw new Error(response.data?.error || "Could not revoke the connection");
        setIntegrationKey("");
      }
      await load();
    } catch (error: unknown) {
      const message = error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : error instanceof Error ? error.message : "The connection could not be saved.";
      toast({ title: "Connection failed", description: message || "The connection could not be saved.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const testConnectivity = async () => {
    setBusy("probe");
    setProbe("");
    try {
      const response = await companyApi.testApiConnectivity();
      const data = response.data?.data || {};
      setProbe(data.ok ? `OK · ${data.ms ?? 0} ms` : data.error || "The health check failed.");
    } catch (error: unknown) {
      const message = error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : "The health check failed.";
      setProbe(message || "The health check failed.");
    } finally {
      setBusy("");
    }
  };

  const sendTest = async (style: "header" | "url-token") => {
    setBusy(style);
    setTestResult("");
    try {
      const response = await companyApi.telephony.testLead(tenantId, style);
      const leadNumber = response.data?.data?.leadNumber;
      if (!response.data?.success || !leadNumber) throw new Error(response.data?.error || "The test lead was not created.");
      setTestResult(`Lead ${leadNumber}`);
    } catch (error: unknown) {
      const message = error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : error instanceof Error ? error.message : "The test lead was not created.";
      setTestResult(message || "The test lead was not created.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Connect an external system</h3>
        <p className="text-sm text-muted-foreground">{companyName}</p>
      </div>
      {(base.privateHost || base.warning) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {base.privateHost ? PRIVATE_WARNING : base.warning}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Base URL</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{base.source === "env" ? "From PUBLIC_API_BASE_URL" : base.source === "request" ? "Auto-detected" : "Unavailable"}</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">{base.baseUrl || "Set PUBLIC_API_BASE_URL"}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyText(base.baseUrl, false)} disabled={!base.baseUrl}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">API key for this company</div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedKey?.id || ""} onChange={(event) => setKeyId(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
              {!activeKeys.length && <option value="">No active key</option>}
              {activeKeys.map((key) => <option key={key.id} value={key.id}>{key.name} · {key.keyPrefix}</option>)}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={onCreateKey}>Create key</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Use the key you saved when you created it, or Rotate to get a new one. Showing {keyLabel}.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void testConnectivity()} disabled={busy === "probe" || !base.baseUrl}>
          {busy === "probe" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test connectivity
        </Button>
        {probe && <span className="text-sm">{probe}</span>}
      </div>
      <Tabs defaultValue="header">
        <TabsList>
          <TabsTrigger value="header">Header auth</TabsTrigger>
          <TabsTrigger value="url">URL token</TabsTrigger>
        </TabsList>
        <TabsContent value="header" className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Webhook / Callback URL: <code>{leadUrl || "Set PUBLIC_API_BASE_URL"}</code></li>
            <li>Method POST</li>
            <li>Content-Type: application/json</li>
            <li>Authorization: Bearer &lt;API key&gt; or X-API-Key: &lt;API key&gt;</li>
          </ol>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{curl || "Set PUBLIC_API_BASE_URL"}</pre>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{pretty(leadExample)}</pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={providerCopyDisabled || !curl} onClick={() => void copyText(curl, true)}>Copy for provider</Button>
            <Button type="button" size="sm" onClick={() => void sendTest("header")} disabled={busy === "header"}>
              {busy === "header" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send test lead
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="url" className="space-y-3">
          <p className="text-sm text-muted-foreground">For a provider that cannot set headers. The token is tied to {companyName}, stored hashed, and shown once.</p>
          {!activeConnection ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2" />
              </label>
              <label className="text-sm">
                IP allowlist
                <input value={allowlist} onChange={(event) => setAllowlist(event.target.value)} placeholder="Optional, comma-separated" className="mt-1 block h-9 w-64 rounded-md border border-input bg-background px-2" />
              </label>
              <Button type="button" size="sm" onClick={() => void saveConnection("create")} disabled={busy === "create"}>Create URL token</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{activeConnection.name} · {activeConnection.keyPrefix}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void saveConnection("rotate")} disabled={busy === "rotate"}>Rotate</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void saveConnection("revoke")} disabled={busy === "revoke"}>Revoke</Button>
            </div>
          )}
          {integrationKey && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">Copy this token now. It will not be shown again.</p>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Webhook / Callback URL: <code className="break-all">{webhookUrl || (activeConnection ? `${base.baseUrl}/api/integrations/telephony/${activeConnection.keyPrefix}…/lead` : "Create a URL token")}</code></li>
            <li>Method POST</li>
            <li>Content-Type: application/json</li>
            <li>No Authorization header. The token in the URL selects the company.</li>
          </ol>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{pretty(SAMPLE_WEBHOOK)}</pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={providerCopyDisabled || !webhookUrl} onClick={() => void copyText(webhookUrl, true)}>Copy for provider</Button>
            <Button type="button" size="sm" onClick={() => void sendTest("url-token")} disabled={busy === "url-token" || !activeConnection}>
              {busy === "url-token" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send test lead
            </Button>
          </div>
          {!integrationKey && activeConnection && <p className="text-xs text-muted-foreground">Use the key you saved when you created it, or Rotate to get a new one.</p>}
        </TabsContent>
      </Tabs>
      {testResult && <p className="text-sm font-medium">{testResult}</p>}
    </section>
  );
}
