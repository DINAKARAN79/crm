"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { callDetailsApi } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";

interface CallDetailsRecord {
  id: string;
  name: string;
  callId: string;
  callType: string;
  callFrom?: string | null;
  callTo?: string | null;
  startAt: string;
  endAt: string;
  duration: number;
  status: string;
  notes?: string | null;
  parentId?: string | null;
  parentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
  lastModifiedBy?: { firstName: string; lastName: string } | null;
  owner?: { firstName: string; lastName: string } | null;
  case?: { id: string; firstName: string; lastName: string; leadNumber?: string | null } | null;
  lead?: { id: string; firstName: string; lastName: string; leadNumber?: string | null } | null;
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium">{children || "—"}</span>
    </div>
  );
}

function personName(person?: { firstName: string; lastName: string } | null) {
  return person ? `${person.firstName} ${person.lastName}`.trim() : "—";
}

function callTypeLabel(status: string) {
  if (status === "COMPLETED") return "Answer";
  if (["NO_ANSWER", "BUSY", "VOICEMAIL", "CANCELLED"].includes(status)) return "Not Answer";
  return status.replaceAll("_", " ");
}

export default function CallDetailsPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [call, setCall] = React.useState<CallDetailsRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const loadCall = async () => {
      setLoading(true);
      try {
        const response = await callDetailsApi.get(params.id);
        if (!response.data.success || !response.data.data) {
          throw new Error(response.data.error || "Call details could not be loaded.");
        }
        if (!cancelled) setCall(response.data.data);
      } catch (error: any) {
        if (!cancelled) {
          toast({
            title: "Unable to load call details",
            description: error?.response?.data?.error || error?.message || "Please try again.",
            variant: "destructive",
          });
          setCall(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadCall();
    return () => {
      cancelled = true;
    };
  }, [params.id, toast]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!call) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Call details not found or you do not have access.
        </CardContent>
      </Card>
    );
  }

  const leadName = call.lead
    ? `${call.lead.firstName} ${call.lead.lastName}`.trim()
    : "—";

  return (
    <div className="space-y-6">
      <RecordPageHeader
        objectLabel="Call Details"
        title={call.name}
        subtitle={`Call ID: ${call.callId}`}
        backHref={call.lead ? `/leads/${encodeURIComponent(call.lead.id)}` : "/home"}
        icon={<Phone className="h-5 w-5" aria-hidden="true" />}
        badges={<Badge variant="outline">{callTypeLabel(call.status)}</Badge>}
      />

      <div className="border-b">
        <div className="inline-flex items-center gap-2 border-b-2 border-primary px-3 py-2 text-sm font-medium">
          <Phone className="h-4 w-4" />
          Details
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b bg-muted/30 py-3">
            <CardTitle>Call Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2">
            <DetailItem label="Call Details Name">{call.name}</DetailItem>
            <DetailItem label="Owner">{personName(call.owner)}</DetailItem>
            <DetailItem label="Call Type">{callTypeLabel(call.status)}</DetailItem>
            <DetailItem label="Direction">{call.callType}</DetailItem>
            <DetailItem label="Call From">{call.callFrom}</DetailItem>
            <DetailItem label="Call To">{call.callTo}</DetailItem>
            <DetailItem label="Start Time">{formatDateTime(call.startAt)}</DetailItem>
            <DetailItem label="End Time">{formatDateTime(call.endAt)}</DetailItem>
            <DetailItem label="Duration">
              {typeof call.duration === "number"
                ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
                : "—"}
            </DetailItem>
            <DetailItem label="Status">{call.status.replaceAll("_", " ")}</DetailItem>
            <DetailItem label="Case">{call.case?.leadNumber || (call.case ? `${call.case.firstName} ${call.case.lastName}`.trim() : "—")}</DetailItem>
            <DetailItem label="Parent ID">{call.parentId}</DetailItem>
            <div className="border-b pb-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{call.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/30 py-3">
              <CardTitle>Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <DetailItem label="Lead">
                {call.lead ? (
                  <Link className="text-primary hover:underline" href={`/leads/${encodeURIComponent(call.lead.id)}`}>
                    {leadName}
                  </Link>
                ) : "—"}
              </DetailItem>
              <DetailItem label="Lead Number">{call.lead?.leadNumber}</DetailItem>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b bg-muted/30 py-3">
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <DetailItem label="Created By">{personName(call.createdBy)}</DetailItem>
              <DetailItem label="Created">{formatDateTime(call.createdAt)}</DetailItem>
              <DetailItem label="Last Modified By">{personName(call.lastModifiedBy)}</DetailItem>
              <DetailItem label="Last Modified">{formatDateTime(call.updatedAt)}</DetailItem>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
