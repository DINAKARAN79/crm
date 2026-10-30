"use client";

import * as React from "react";
import { Copy, ExternalLink, Search } from "lucide-react";
import { companyApiUrl } from "@/lib/company-api-url";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface ApiParam {
  name: string;
  in: string;
  required: boolean;
}

interface ApiOperation {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  params: ApiParam[];
  updateMode?: "partial" | "replace";
  body?: {
    requiredExample: Record<string, unknown>;
    fullExample: Record<string, unknown>;
  };
}

interface ApiTopic {
  objectName: string;
  label: string;
  description: string;
  operations: ApiOperation[];
}

const methodClass: Record<HttpMethod, string> = {
  GET: "bg-emerald-600 text-white",
  POST: "bg-blue-600 text-white",
  PUT: "bg-orange-500 text-white",
  DELETE: "bg-red-600 text-white",
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function OperationRow({
  operation,
  baseUrl,
  tenantId,
  onDetails,
}: {
  operation: ApiOperation;
  baseUrl: string;
  tenantId: string;
  onDetails: () => void;
}) {
  const { toast } = useToast();
  const [full, setFull] = React.useState(false);
  const built = companyApiUrl({
    baseUrl,
    path: operation.path,
    tenantId,
    params: operation.params,
  });
  const payload = operation.body ? pretty(full ? operation.body.fullExample : operation.body.requiredExample) : "";
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 border-t px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${methodClass[operation.method]}`}>{operation.method}</span>
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{built.url}</code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyText(built.url)}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        {operation.method === "GET" && (
          <a href={built.url} target="_blank" rel="noreferrer" aria-label={`Open ${operation.summary}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {built.replaceWithRealValue.length > 0 && (
        <p className="text-xs text-amber-800">
          {built.replaceWithRealValue.map((name) => `<${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}>`).join(", ")} — replace with a real value.
        </p>
      )}
      {operation.method === "GET" && built.queryExample && (
        <p className="text-xs text-muted-foreground">Query examples: <code>{built.queryExample}</code></p>
      )}
      {operation.body && (operation.method === "POST" || operation.method === "PUT") && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={full ? "outline" : "secondary"} onClick={() => setFull(false)}>Required only</Button>
            <Button type="button" size="sm" variant={full ? "secondary" : "outline"} onClick={() => setFull(true)}>Full example</Button>
            <span className="self-center text-xs text-muted-foreground">
              {operation.method === "PUT" && operation.updateMode === "partial" ? "Partial update. Send only the fields you want to change." : "Sample values are fake."}
            </span>
          </div>
          <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{payload}</pre>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyText(payload)}>
            <Copy className="h-3.5 w-3.5" /> Copy payload
          </Button>
        </div>
      )}
      <Button type="button" size="sm" variant="outline" onClick={onDetails}>Details</Button>
    </div>
  );
}

export function CompanyApiCards<TOp extends ApiOperation, TTopic extends ApiTopic & { operations: TOp[] }>({
  topics,
  baseUrl,
  tenantId,
  onDetails,
}: {
  topics: TTopic[];
  baseUrl: string;
  tenantId: string;
  onDetails: (topic: TTopic, operation: TOp) => void;
}) {
  const [query, setQuery] = React.useState("");
  const visible = topics.filter((topic) => {
    const haystack = `${topic.label} ${topic.objectName} ${topic.operations.map((operation) => operation.path).join(" ")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Required header: <code>Authorization: Bearer &lt;API key&gt;</code> (or <code>X-API-Key</code>), <code>Content-Type: application/json</code>
      </p>
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search objects"
          aria-label="Search API objects"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
        />
      </div>
      {visible.map((topic) => (
        <section key={topic.objectName} className="overflow-hidden rounded-md border bg-card">
          <div className="px-4 py-3">
            <h3 className="text-base font-semibold">{topic.label} API</h3>
            <p className="text-sm text-muted-foreground">{topic.description}</p>
          </div>
          {topic.operations.map((operation: TOp) => (
            <OperationRow
              key={operation.id}
              operation={operation}
              baseUrl={baseUrl}
              tenantId={tenantId}
              onDetails={() => onDetails(topic, operation)}
            />
          ))}
        </section>
      ))}
      {!visible.length && <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No objects match.</p>}
    </div>
  );
}
