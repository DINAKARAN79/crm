"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronDown, Copy, Download, KeyRound, Loader2, Search } from "lucide-react";
import api, { companyApi } from "@/lib/api";
import { CompanyApiKeys } from "@/components/crm/company-api-keys";
import { CompanyConnection, type PublicBaseUrl } from "@/components/crm/company-connection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface CatalogField {
  name: string;
  path: string;
  type: string;
  requirement: "required" | "optional" | "conditional";
  condition?: string;
  enumValues?: string[];
  maxLength?: number;
  format?: string;
  description: string;
}

interface ApiParam {
  name: string;
  in: "path" | "query" | "header";
  type: string;
  required: boolean;
  description: string;
}

interface ApiOperation {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  scope: string | null;
  authNote: string;
  params: ApiParam[];
  headers: ApiParam[];
  updateMode?: "partial" | "replace";
  updateNote?: string;
  immutableAfterCreate?: string[];
  valueDifferences?: Array<{ field: string; create: string[]; update: string[] }>;
  body?: {
    fields: CatalogField[];
    requiredExample: Record<string, unknown>;
    fullExample: Record<string, unknown>;
  };
  successStatus: number;
  successExample: Record<string, unknown>;
  errors: Array<{ status: number; body: Record<string, unknown> }>;
  readOnlyResponseFields: string[];
  queryExample?: string | null;
}

interface ApiTopic {
  objectName: string;
  label: string;
  description: string;
  operations: ApiOperation[];
}

interface ApiCatalog {
  baseUrl: string;
  topics: ApiTopic[];
  schemaObjectNames: string[];
  openapi: Record<string, unknown>;
}

interface RegistryObject {
  name: string;
  label: string;
  pluralLabel?: string;
  description?: string | null;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt?: string | null;
}

interface FieldError {
  field: string;
  message: string;
}

const methodClass: Record<HttpMethod, string> = {
  GET: "bg-emerald-600 text-white",
  POST: "bg-blue-600 text-white",
  PUT: "bg-orange-500 text-white",
  DELETE: "bg-red-600 text-white",
};

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, key) => {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, record);
}

function localFieldErrors(fields: CatalogField[], body: unknown): FieldError[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [{ field: "", message: "Request body must be a JSON object." }];
  }
  const record = body as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const field of fields) {
    if (field.type === "object") continue;
    const value = valueAt(record, field.path);
    const empty = value === undefined || value === "";
    if (field.requirement === "required" && empty) {
      errors.push({ field: field.path, message: `${field.description} is required.` });
    }
    if (field.requirement === "conditional" && record.type === "Apartment" && (field.name === "block" || field.name === "floor") && empty) {
      errors.push({ field: field.path, message: field.condition || `${field.description} is required when type is Apartment.` });
    }
    if (field.enumValues?.length && value !== undefined && value !== "" && !field.enumValues.includes(String(value))) {
      errors.push({ field: field.path, message: `${field.description} must be one of ${field.enumValues.join(", ")}.` });
    }
  }
  return errors;
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function exampleUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.replace(/:([A-Za-z0-9_]+)/g, "cmexample000000000000000001")}`;
}

function snippet(language: "curl" | "fetch" | "python", method: HttpMethod, url: string, body: unknown | null, secret: string) {
  const key = secret || "<key>";
  const payload = body ? pretty(body) : "";
  if (language === "curl") {
    const lines = [`curl -X ${method} '${url}'`, `  -H 'Authorization: Bearer ${key}'`];
    if (body) lines.push("  -H 'Content-Type: application/json'", `  -d '${payload}'`);
    return lines.join(" \\\n");
  }
  if (language === "fetch") {
    return `await fetch('${url}', {
  method: '${method}',
  headers: {
    Authorization: 'Bearer ${key}',${body ? "\n    'Content-Type': 'application/json'," : ""}
  },${body ? `\n  body: JSON.stringify(${payload}),` : ""}
});`;
  }
  return `import requests

response = requests.${method.toLowerCase()}(
    '${url}',
    headers={'Authorization': 'Bearer ${key}'${body ? ", 'Content-Type': 'application/json'" : ""}},${body ? `\n    json=${payload},` : ""}
)`;
}

export function ApiOperationRow({
  operation,
  objectName,
  baseUrl,
  open,
  onToggle,
  keys,
  secret,
  onSecretChange,
  detailsOnly = false,
}: {
  operation: ApiOperation;
  objectName: string;
  baseUrl: string;
  open: boolean;
  onToggle?: () => void;
  keys: ApiKeyRecord[];
  secret: string;
  onSecretChange: (value: string) => void;
  detailsOnly?: boolean;
}) {
  const { toast } = useToast();
  const [payloadMode, setPayloadMode] = React.useState<"required" | "full">("required");
  const [language, setLanguage] = React.useState<"curl" | "fetch" | "python">("curl");
  const [tryBody, setTryBody] = React.useState(operation.body ? pretty(operation.body.requiredExample) : "");
  const [sandbox, setSandbox] = React.useState(operation.method !== "GET");
  const [keyId, setKeyId] = React.useState(keys.find((key) => !key.revokedAt)?.id || "");
  const [running, setRunning] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldError[]>([]);
  const [result, setResult] = React.useState<{ status: number; ms: number; body: unknown } | null>(null);
  const activePayload = operation.body
    ? (payloadMode === "required" ? operation.body.requiredExample : operation.body.fullExample)
    : null;
  const url = exampleUrl(baseUrl, operation.path);
  const errorFields = new Set(fieldErrors.map((error) => error.field));

  React.useEffect(() => {
    setTryBody(operation.body ? pretty(payloadMode === "required" ? operation.body.requiredExample : operation.body.fullExample) : "");
    setFieldErrors([]);
    setResult(null);
  }, [operation, payloadMode]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const runTry = async () => {
    setFieldErrors([]);
    setResult(null);
    if (!sandbox && !secret) {
      setFieldErrors([{ field: "", message: "Paste the API key secret to send a live request, or turn on Sandbox." }]);
      return;
    }
    let parsedBody: unknown = undefined;
    if (operation.body) {
      try {
        parsedBody = JSON.parse(tryBody);
      } catch {
        setFieldErrors([{ field: "", message: "Body is not valid JSON." }]);
        return;
      }
      const local = localFieldErrors(operation.body.fields, parsedBody);
      if (local.length) {
        setFieldErrors(local);
        return;
      }
      const validated = await companyApi.validateApiCatalog({
        objectName,
        operationId: operation.id,
        body: parsedBody,
      });
      const serverErrors = (validated.data?.data?.fieldErrors || []) as FieldError[];
      if (!validated.data?.data?.valid) {
        setFieldErrors(serverErrors.length ? serverErrors : [{ field: "", message: "The body does not match the schema." }]);
        return;
      }
    }
    setRunning(true);
    try {
      const response = await companyApi.tryApiCatalog({
        method: operation.method,
        path: operation.path.replace(/:([A-Za-z0-9_]+)/g, "cmexample000000000000000001"),
        body: parsedBody,
        apiKey: secret || undefined,
        sandbox,
        objectName,
        operationId: operation.id,
      });
      const data = response.data?.data || {};
      if (data.fieldErrors?.length && data.status === 400) {
        setFieldErrors(data.fieldErrors);
      }
      setResult({ status: data.status, ms: data.ms ?? 0, body: data.body });
    } catch (error: unknown) {
      const message = error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : "The request failed.";
      setResult({ status: 0, ms: 0, body: { success: false, error: message || "The request failed." } });
    } finally {
      setRunning(false);
    }
  };

  const showDetails = detailsOnly || open;
  return (
    <div className={detailsOnly ? "" : "rounded-md border bg-card"}>
      {!detailsOnly && (
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${methodClass[operation.method]}`}>{operation.method}</span>
          <span className="min-w-0 flex-1 text-sm font-medium">{operation.summary}</span>
          {operation.scope && <Badge variant="outline" className="font-normal">{operation.scope}</Badge>}
          <code className="max-w-full truncate text-xs text-muted-foreground">{operation.path}</code>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {showDetails && (
        <div className={detailsOnly ? "space-y-4 text-sm" : "space-y-4 border-t px-3 py-3 text-sm"}>
          <section>
            <h4 className="mb-1 font-medium">Description</h4>
            <p className="text-muted-foreground">{operation.description}</p>
            <p className="mt-1 text-muted-foreground">{operation.authNote}</p>
          </section>
          <section>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="font-medium">URL</h4>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyText(url)}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <code className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">{url}</code>
          </section>
          {!!operation.params.length && (
            <section>
              <h4 className="mb-1 font-medium">Parameters</h4>
              <ParamTable params={operation.params} />
            </section>
          )}
          <section>
            <h4 className="mb-1 font-medium">Headers</h4>
            <ParamTable params={operation.headers} />
          </section>
          {operation.body && (
            <section className="space-y-2">
              <h4 className="font-medium">Request body</h4>
              {operation.updateNote && <p className="text-muted-foreground">{operation.updateNote}</p>}
              {!!operation.immutableAfterCreate?.length && (
                <p className="text-muted-foreground">Cannot be changed after creation: {operation.immutableAfterCreate.join(", ")}.</p>
              )}
              {operation.valueDifferences?.map((difference) => (
                <p key={difference.field} className="text-muted-foreground">
                  {difference.field}: create allows {difference.create.join(", ")}; update also allows {difference.update.filter((value) => !difference.create.includes(value)).join(", ")}.
                </p>
              ))}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Field</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Required</th>
                      <th className="px-2 py-1.5 font-medium">Allowed values</th>
                      <th className="px-2 py-1.5 font-medium">Format</th>
                      <th className="px-2 py-1.5 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operation.body.fields.filter((field) => field.type !== "object" || !operation.body?.fields.some((child) => child.path.startsWith(`${field.path}.`))).map((field) => (
                      <tr key={field.path} className={`border-t ${errorFields.has(field.path) ? "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100" : ""}`}>
                        <td className="px-2 py-1.5 font-mono">{field.path}</td>
                        <td className="px-2 py-1.5">{field.type}</td>
                        <td className="px-2 py-1.5">
                          {field.requirement === "required" && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Required</span>}
                          {field.requirement === "optional" && <span className="text-muted-foreground">Optional</span>}
                          {field.requirement === "conditional" && <span title={field.condition} className="cursor-help rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Conditional</span>}
                        </td>
                        <td className="px-2 py-1.5">{field.enumValues?.join(", ") || "—"}</td>
                        <td className="px-2 py-1.5">{[field.format, field.maxLength ? `max ${field.maxLength}` : ""].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-2 py-1.5">{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Tabs value={payloadMode} onValueChange={(value) => setPayloadMode(value as "required" | "full")}>
                <TabsList>
                  <TabsTrigger value="required">Required only</TabsTrigger>
                  <TabsTrigger value="full">Full example</TabsTrigger>
                </TabsList>
                <TabsContent value={payloadMode}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyText(pretty(activePayload))}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setTryBody(pretty(activePayload))}>
                      Use in Try it
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{pretty(activePayload)}</pre>
                </TabsContent>
              </Tabs>
            </section>
          )}
          <section>
            <h4 className="mb-1 font-medium">Example request</h4>
            <Tabs value={language} onValueChange={(value) => setLanguage(value as "curl" | "fetch" | "python")}>
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="fetch">JavaScript fetch</TabsTrigger>
                <TabsTrigger value="python">Python requests</TabsTrigger>
              </TabsList>
              <TabsContent value={language}>
                <div className="mb-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyText(snippet(language, operation.method, url, activePayload, secret))}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{snippet(language, operation.method, url, activePayload, secret)}</pre>
              </TabsContent>
            </Tabs>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Example response</h4>
            {!!operation.readOnlyResponseFields.length && (
              <p className="mb-1 text-xs text-muted-foreground">Read-only in the response: {operation.readOnlyResponseFields.join(", ")}.</p>
            )}
            <p className="mb-1 text-xs text-muted-foreground">{operation.successStatus}</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{pretty(operation.successExample)}</pre>
            <div className="mt-2 space-y-2">
              {operation.errors.map((error) => (
                <div key={error.status}>
                  <p className="mb-1 text-xs text-muted-foreground">{error.status}</p>
                  <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{pretty(error.body)}</pre>
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h4 className="font-medium">Try it</h4>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                API key
                <select value={keyId} onChange={(event) => setKeyId(event.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                  <option value="">Select a key</option>
                  {keys.map((key) => (
                    <option key={key.id} value={key.id}>{key.name} · {key.keyPrefix}{key.revokedAt ? " · revoked" : ""}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-[220px] flex-1 text-xs text-muted-foreground">
                Secret
                <input value={secret} onChange={(event) => onSecretChange(event.target.value)} placeholder="dct_..." className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs">
                <input type="checkbox" checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} />
                Sandbox
              </label>
            </div>
            {operation.body && (
              <textarea
                value={tryBody}
                onChange={(event) => setTryBody(event.target.value)}
                rows={8}
                className={`w-full rounded-md border bg-background p-2 font-mono text-xs ${fieldErrors.length ? "border-red-600" : "border-input"}`}
              />
            )}
            {!!fieldErrors.length && (
              <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                {fieldErrors.map((error) => (
                  <li key={`${error.field}-${error.message}`}>{error.field ? `${error.field}: ` : ""}{error.message}</li>
                ))}
              </ul>
            )}
            <Button type="button" size="sm" onClick={() => void runTry()} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Send
            </Button>
            {result && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Status {result.status || "—"} · {result.ms} ms</p>
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{pretty(result.body)}</pre>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ParamTable({ params }: { params: ApiParam[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-muted/60">
          <tr>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 font-medium">In</th>
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 font-medium">Required</th>
            <th className="px-2 py-1.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={`${param.in}-${param.name}`} className="border-t">
              <td className="px-2 py-1.5 font-mono">{param.name}</td>
              <td className="px-2 py-1.5">{param.in}</td>
              <td className="px-2 py-1.5">{param.type}</td>
              <td className="px-2 py-1.5">{param.required ? "Required" : "Optional"}</td>
              <td className="px-2 py-1.5">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiTopicPanel({
  topic,
  registry,
  baseUrl,
  keys,
  secret,
  onSecretChange,
}: {
  topic: ApiTopic | null;
  registry: RegistryObject;
  baseUrl: string;
  keys: ApiKeyRecord[];
  secret: string;
  onSecretChange: (value: string) => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOp = searchParams.get("op") || "";
  const [fullIds, setFullIds] = React.useState<string[]>([]);
  const openOperation = topic?.operations.find((operation) => operation.id === requestedOp) || null;

  const setOp = (operationId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "api");
    params.set("object", registry.name.toLowerCase());
    if (operationId) params.set("op", operationId);
    else params.delete("op");
    router.replace(`/admin/companies?${params.toString()}`);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  if (!topic) {
    return (
      <div className="rounded-md border border-dashed p-6">
        <h2 className="text-lg font-semibold">{registry.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{registry.description || `${registry.label} records for this company.`}</p>
        <p className="mt-4 text-sm text-muted-foreground">No validation schema is defined for {registry.label}, so example fields are not shown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{topic.label}</h2>
        <p className="text-sm text-muted-foreground">{topic.description}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Required headers: <code>Authorization: Bearer &lt;API key&gt;</code> or <code>X-API-Key: &lt;API key&gt;</code>, <code>Content-Type: application/json</code>
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">API Link</th>
              <th className="px-3 py-2 font-medium">Example payload</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {topic.operations.map((operation) => {
              const href = baseUrl ? exampleUrl(baseUrl, operation.path) : "";
              const showFull = fullIds.includes(operation.id);
              const payload = operation.body
                ? pretty(showFull ? operation.body.fullExample : operation.body.requiredExample)
                : "";
              return (
                <tr key={operation.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${methodClass[operation.method]}`}>{operation.method}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <code className="break-all font-mono text-xs">{href || operation.path}</code>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyText(href)} disabled={!href}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {operation.method === "GET" && operation.queryExample && (
                      <div className="space-y-2">
                        <p>Query example: <code className="font-mono text-xs">{operation.queryExample}</code></p>
                        <Button type="button" size="sm" variant="outline" onClick={() => setOp(operation.id)}>View response</Button>
                      </div>
                    )}
                    {(operation.method === "DELETE" || (operation.method === "GET" && !operation.queryExample)) && (
                      <div className="space-y-2">
                        <p>none</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => setOp(operation.id)}>View response</Button>
                      </div>
                    )}
                    {operation.body && (operation.method === "POST" || operation.method === "PUT") && (
                      <div className="space-y-2">
                        <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{payload}</pre>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void copyText(payload)}>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setFullIds((current) => current.includes(operation.id) ? current.filter((id) => id !== operation.id) : [...current, operation.id])}
                          >
                            {showFull ? "Required only" : "Full example"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => setOp(operation.id)}>Details</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openOperation && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOp(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-background p-4 shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={openOperation.summary}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">{openOperation.summary}</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setOp(null)}>Close</Button>
            </div>
            <ApiOperationRow
              operation={openOperation}
              objectName={topic.objectName}
              baseUrl={baseUrl}
              open
              detailsOnly
              keys={keys}
              secret={secret}
              onSecretChange={onSecretChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function CompanyApiReference({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = React.useState<ApiCatalog | null>(null);
  const [objects, setObjects] = React.useState<RegistryObject[]>([]);
  const [keys, setKeys] = React.useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [topicQuery, setTopicQuery] = React.useState("");
  const [keysOpen, setKeysOpen] = React.useState(false);
  const [secret, setSecret] = React.useState("");
  const [base, setBase] = React.useState<PublicBaseUrl>({ baseUrl: "", source: "rejected", privateHost: false, warning: null });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogResponse, objectResponse, keyResponse, baseResponse] = await Promise.all([
        companyApi.apiCatalog(),
        api.get("/api/objects", { params: { tenantId, includeInactive: "true" } }),
        companyApi.apiKeys.list(tenantId),
        companyApi.apiBaseUrl(),
      ]);
      if (!catalogResponse.data?.success) throw new Error(catalogResponse.data?.error || "Failed to load the API catalog");
      if (!objectResponse.data?.success) throw new Error(objectResponse.data?.error || "Failed to load objects");
      setCatalog(catalogResponse.data.data as ApiCatalog);
      setObjects((objectResponse.data.data || []) as RegistryObject[]);
      setKeys((keyResponse.data?.data || []) as ApiKeyRecord[]);
      if (baseResponse.data?.success && baseResponse.data.data) setBase(baseResponse.data.data as PublicBaseUrl);
    } catch (loadError: unknown) {
      const message = loadError && typeof loadError === "object" && "response" in loadError
        ? (loadError as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
          || (loadError as { message?: string }).message
        : "Failed to load the API reference";
      setError(message || "Failed to load the API reference");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => { void load(); }, [load]);

  const selectedName = (searchParams.get("object") || "").toLowerCase();
  const visibleObjects = objects.filter((object) =>
    `${object.label} ${object.name}`.toLowerCase().includes(topicQuery.toLowerCase()),
  );
  const selected = objects.find((object) => object.name.toLowerCase() === selectedName) || visibleObjects[0] || objects[0];
  const topic = catalog?.topics.find((item) => item.objectName.toLowerCase() === selected?.name.toLowerCase()) || null;

  const chooseObject = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "api");
    params.set("object", name.toLowerCase());
    params.delete("op");
    router.replace(`/admin/companies?${params.toString()}`);
  };

  const refreshKeys = React.useCallback(async () => {
    const keyResponse = await companyApi.apiKeys.list(tenantId);
    setKeys((keyResponse.data?.data || []) as ApiKeyRecord[]);
  }, [tenantId]);

  const downloadSpec = () => {
    if (!catalog) return;
    const spec = structuredClone(catalog.openapi) as { servers?: Array<{ url?: string }> };
    if (base.baseUrl && spec.servers?.[0]) spec.servers[0].url = base.baseUrl;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${companyName.replace(/\s+/g, "-").toLowerCase()}-openapi.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{companyName}</h2>
          <p className="text-sm text-muted-foreground">External systems authenticate with an API key for this company.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={downloadSpec} disabled={!catalog}>
            <Download className="h-4 w-4" /> Download OpenAPI JSON
          </Button>
          <Button type="button" onClick={() => setKeysOpen(true)}>
            <KeyRound className="h-4 w-4" /> API Keys
          </Button>
        </div>
      </div>
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={topicQuery} onChange={(event) => setTopicQuery(event.target.value)} placeholder="Search objects" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
            </div>
            <div className="flex gap-1 overflow-x-auto md:block md:max-h-[70vh] md:space-y-1 md:overflow-y-auto">
              {visibleObjects.map((object) => (
                <button
                  key={object.name}
                  type="button"
                  onClick={() => chooseObject(object.name)}
                  className={`shrink-0 rounded-md px-3 py-2 text-left text-sm md:block md:w-full ${selected?.name === object.name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {object.label}
                </button>
              ))}
              {!visibleObjects.length && <p className="px-2 py-4 text-sm text-muted-foreground">No objects match.</p>}
            </div>
          </div>
          {selected && catalog ? (
            <div className="space-y-4">
              <CompanyConnection
                tenantId={tenantId}
                companyName={companyName}
                base={base}
                keys={keys}
                secret={secret}
                leadExample={catalog.topics.find((item) => item.objectName === "Lead")?.operations.find((operation) => operation.id === "post-create")?.body?.requiredExample || { lastName: "Kumar", phone: "+919000000000", company: "Test Co" }}
                onCreateKey={() => setKeysOpen(true)}
              />
              <ApiTopicPanel
                topic={topic}
                registry={selected}
                baseUrl={base.baseUrl}
                keys={keys}
                secret={secret}
                onSecretChange={setSecret}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">This company has no objects in Object Manager.</div>
          )}
        </div>
      )}
      <Dialog open={keysOpen} onOpenChange={(open) => { setKeysOpen(open); if (!open) void refreshKeys(); }}>
        <DialogContent className="max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>API Keys</DialogTitle>
            <DialogDescription>Create, rotate, or revoke keys for {companyName}.</DialogDescription>
          </DialogHeader>
          <CompanyApiKeys tenantId={tenantId} onSecret={setSecret} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
