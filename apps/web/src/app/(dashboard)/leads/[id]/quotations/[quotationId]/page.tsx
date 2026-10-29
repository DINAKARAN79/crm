"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Eye, FileText, Loader2, MapPinned, Printer } from "lucide-react";
import { quotationDueLabel, quotationPropertyFields, quotationScheduleAmounts } from "@dct-crm/shared";
import { quotationApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { PdfDocumentPreview, type PdfPreviewDocument } from "@/components/crm/pdf-document-preview";
import type { Quotation } from "@/components/crm/lead-quotations";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));

const locationLine = (parts: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  return parts
    .flatMap((part) => part?.split(",") || [])
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
};

export default function QuotationRecordPage() {
  const params = useParams<{ id: string; quotationId: string }>();
  const { hasPermission, isAdmin, isSuperAdmin } = useAuth();
  const [quotation, setQuotation] = React.useState<Quotation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = React.useState<PdfPreviewDocument | null>(null);
  const [pdfAction, setPdfAction] = React.useState<"preview" | "download" | "print" | null>(null);

  const canCreateBooking = hasPermission("Lead", "edit") || isAdmin || isSuperAdmin;

  React.useEffect(() => {
    let active = true;
    const loadQuotation = async () => {
      try {
        const response = await quotationApi.listForLead(params.id);
        const quotations = (response.data.data || []) as Quotation[];
        const record = quotations.find((item) => item.id === params.quotationId);
        if (!record) throw new Error("Quotation not found.");
        if (active) setQuotation(record);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Quotation could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadQuotation();
    return () => {
      active = false;
    };
  }, [params.id, params.quotationId]);

  React.useEffect(() => () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview]);

  const closePdfPreview = () => {
    setPdfPreview(null);
  };

  const runPdfAction = async (action: "preview" | "download" | "print") => {
    if (!quotation) return;
    setPdfAction(action);
    try {
      const response = await quotationApi.downloadPdf(params.id, quotation.id);
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (action === "preview") {
        setPdfPreview((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return {
            number: quotation.quotationNumber,
            url,
            eyebrow: "Quotation preview",
            description: "Download and print use the saved quotation PDF.",
          };
        });
      } else if (action === "download") {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${quotation.quotationNumber}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const frame = document.createElement("iframe");
        frame.title = `${quotation.quotationNumber} print`;
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
        frame.src = url;
        document.body.appendChild(frame);
        frame.onload = () => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          window.setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(url);
          }, 1500);
        };
      }
    } catch (cause) {
      console.error(`Failed to ${action} quotation PDF:`, cause);
      setError("Could not open the quotation PDF. Please try again.");
    } finally {
      setPdfAction(null);
    }
  };

  if (loading) {
    return <div role="status" className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!quotation) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p role="alert" className="text-sm text-destructive">{error || "Quotation not found."}</p>
          <Button asChild variant="outline">
            <Link href={`/leads/${encodeURIComponent(params.id)}?tab=quotations`}>Back to lead quotations</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const installmentAmounts = quotationScheduleAmounts(
    quotation.totalPrice,
    quotation.paymentPlan?.installments.map((item) => item.percentage) || [],
  );

  return (
    <>
      <div className="space-y-4">
        <RecordPageHeader
          objectLabel="Quotation"
          title={quotation.quotationNumber}
          subtitle={`${quotation.projectName} · ${quotation.unitNumber}`}
          backHref={`/leads/${encodeURIComponent(params.id)}?tab=quotations`}
          icon={<FileText className="h-5 w-5" aria-hidden="true" />}
          badges={<Badge variant={quotation.booking ? "default" : "secondary"}>{quotation.booking ? "BOOKED" : quotation.status}</Badge>}
          actions={
            <>
              <Button type="button" onClick={() => void runPdfAction("preview")} disabled={!!pdfAction}>
                {pdfAction === "preview" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                Preview PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => void runPdfAction("download")} disabled={!!pdfAction}>
                {pdfAction === "download" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Download PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => void runPdfAction("print")} disabled={!!pdfAction}>
                {pdfAction === "print" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
                Print
              </Button>
            </>
          }
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="border-b bg-muted/40 px-4 py-3">
                <CardTitle className="text-base">Customer information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{quotation.customerName}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone / email</p><p className="font-medium">{quotation.customerPhone || "—"} · {quotation.customerEmail || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Customer address</p><p className="font-medium">{quotation.customerAddress || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Quotation date</p><p className="font-medium">{formatDate(quotation.confirmedAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">Created by</p><p className="font-medium">{quotation.createdBy ? `${quotation.createdBy.firstName} ${quotation.createdBy.lastName}` : "CRM user"}</p></div>
                <div><p className="text-xs text-muted-foreground">Organization type</p><p className="font-medium">{quotation.booking?.profession?.organizationType || "—"}</p></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/40 px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4" />Project and property</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Project:</span> {quotation.projectName}</p>
                  <p><span className="text-muted-foreground">Location:</span> {locationLine([quotation.project?.address, quotation.project?.city, quotation.project?.state]) || "—"}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {quotationPropertyFields({
                    unitType: quotation.unit?.type || quotation.unitType,
                    unitNumber: quotation.unitNumber,
                    block: quotation.unit?.block,
                    floor: quotation.unit?.floor,
                    area: quotation.area,
                  }).map((field) => (
                    <div key={field.label} className="rounded-md border bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
                      <p className="mt-0.5 text-sm font-medium">{field.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/40 px-4 py-3">
                <CardTitle className="text-base">Payment plan</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{quotation.paymentPlanName || "—"}</p>
                <div className="mt-3 overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Milestone</span><span>Due</span><span className="text-right">Amount</span>
                  </div>
                  {quotation.paymentPlan?.installments.length ? quotation.paymentPlan.installments.map((installment, index) => (
                    <div key={`${installment.milestone}-${index}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 border-t px-3 py-2 text-sm">
                      <span className="min-w-0">{installment.milestone} ({installment.percentage}%)</span>
                      <span className="text-muted-foreground">{quotationDueLabel(installment)}</span>
                      <span className="text-right font-medium tabular-nums">{formatCurrency(installmentAmounts[index] || 0)}</span>
                    </div>
                  )) : <p className="border-t px-3 py-3 text-sm text-muted-foreground">No payment schedule was recorded.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/40 px-4 py-3">
                <CardTitle className="text-base">Terms and conditions</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="whitespace-pre-wrap text-sm">{quotation.terms?.trim() || "No additional terms were recorded on this quotation."}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/40 px-4 py-3">
              <CardTitle className="text-base">Price summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="flex justify-between gap-3"><span>Base price</span><span className="tabular-nums">{formatCurrency(quotation.basePrice)}</span></div>
              <div className="flex justify-between gap-3"><span>Additional charges</span><span className="tabular-nums">{formatCurrency(quotation.plcAmount)}</span></div>
              <div className="flex justify-between gap-3"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(quotation.basePrice + quotation.plcAmount)}</span></div>
              <div className="flex justify-between gap-3"><span>Discount</span><span className="tabular-nums">{formatCurrency(quotation.discountAmount)}</span></div>
              <div className="flex justify-between gap-3"><span>Taxes</span><span className="tabular-nums">{formatCurrency(0)}</span></div>
              <div className="flex justify-between gap-3 rounded-md bg-slate-900 px-3 py-2.5 font-semibold text-white"><span>Grand total</span><span className="tabular-nums">{formatCurrency(quotation.totalPrice)}</span></div>
              {quotation.booking ? (
                <p className="pt-1 font-medium text-emerald-700">Booking {quotation.booking.bookingNumber} saved; this unit is reserved.</p>
              ) : canCreateBooking ? (
                <Button asChild className="w-full">
                  <Link href={`/leads/${encodeURIComponent(params.id)}?tab=quotations&createBooking=${encodeURIComponent(quotation.id)}`}>Create Booking</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <PdfDocumentPreview preview={pdfPreview} onClose={closePdfPreview} />
    </>
  );
}
