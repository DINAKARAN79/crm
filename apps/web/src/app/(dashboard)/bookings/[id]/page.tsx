"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, CheckCircle2, Eye, Loader2, Receipt, RefreshCw, StickyNote, XCircle } from "lucide-react";
import { BOOKING_STAGE_OPTIONS } from "@dct-crm/shared";
import { bookingApi } from "@/lib/api";
import { useRecordView } from "@/components/crm/list-view-control";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { BookingDetailsBody, type BookingRecord } from "@/components/crm/lead-bookings";
import { PdfDocumentPreview, type PdfPreviewDocument } from "@/components/crm/pdf-document-preview";
import { LeadReceipts } from "@/components/crm/lead-receipts";
import { LeadInstallments } from "@/components/crm/lead-installments";
import StickyNotesCard from "@/components/crm/sticky-notes-card";
import LeadActivityHistoryCard from "@/components/crm/lead-activity-history-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function BookingRecordPage() {
  const { id } = useParams<{ id: string }>();
  useRecordView("BOOKING", id);
  const router = useRouter();
  const { toast } = useToast();
  const { isLoading: authLoading, isAdmin, isSuperAdmin, profile } = useAuth();
  const allowed = isAdmin || isSuperAdmin || /^crm(?:\s|$)/i.test(profile?.name?.trim() || "");
  const [booking, setBooking] = React.useState<BookingRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState("details");
  const [notesSignal, setNotesSignal] = React.useState(0);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelNotes, setCancelNotes] = React.useState("");
  const [pdfPreview, setPdfPreview] = React.useState<PdfPreviewDocument | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await bookingApi.get(id);
      setBooking(response.data.data as BookingRecord);
    } catch {
      toast({ title: "Booking could not be loaded", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!allowed) {
      router.replace("/home");
      return;
    }
    void load();
  }, [authLoading, allowed, load, router]);

  const stage = booking?.bookingStage || "NEW_BOOKING";
  const cancelled = stage === "CANCELLED";

  const changeStage = async (next: string) => {
    if (!booking || next === stage || cancelled) return;
    if (next === "CANCELLED") return;
    setSaving(true);
    try {
      await bookingApi.updateStage(booking.id, next);
      await load();
      toast({ title: "Booking status updated" });
    } catch {
      toast({ title: "Could not update status", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const cancellationPending = booking?.cancellationStatus === "PENDING";

  const submitCancellation = async () => {
    if (!booking || cancelNotes.trim().length < 3) return;
    setSaving(true);
    try {
      await bookingApi.requestCancellation(booking.id, cancelNotes.trim());
      setCancelOpen(false);
      setCancelNotes("");
      await load();
      toast({ title: "Cancellation sent to MIS team" });
    } catch (cause) {
      const message = (cause as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ title: message || "Could not send cancellation request", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const closePdfPreview = () => {
    setPdfPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const previewPdf = async () => {
    if (!booking?.lead) return;
    try {
      setPreviewing(true);
      const response = await bookingApi.downloadPdf(booking.lead.id, booking.id);
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          number: booking.bookingNumber,
          url,
          eyebrow: "Booking preview",
          description: "Download and print use the saved booking PDF.",
        };
      });
    } catch {
      toast({ title: "Could not preview PDF", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const downloadPdf = async () => {
    if (!booking?.lead) return;
    try {
      const response = await bookingApi.downloadPdf(booking.lead.id, booking.id);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${booking.bookingNumber}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: "Could not download PDF", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!booking) {
    return <div className="p-6 text-sm text-muted-foreground">Booking not found.</div>;
  }

  const currentIndex = BOOKING_STAGE_OPTIONS.findIndex((option) => option.value === stage);

  return (
    <div className="crm-sky mx-auto w-full max-w-none space-y-3 p-3 sm:p-4 [&_button.border]:border-sky-200 [&_button.border]:text-[#075d91] [&_button.border:hover]:bg-sky-50 [&_[data-radix-collection-item]]:cursor-pointer">
      <Button asChild variant="ghost" size="sm" className="text-[#075d91] hover:bg-sky-50">
        <Link href="/bookings"><ArrowLeft className="mr-1.5 h-4 w-4" />Booking Details</Link>
      </Button>

      <Card className="rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1479a8]">Booking</p>
              <h1 className="text-xl font-bold text-[#075d91]">{booking.bookingNumber}</h1>
              <p className="text-sm text-muted-foreground">{booking.project.name} · {booking.unit.number}</p>
              <p className="text-sm text-muted-foreground">
                CRM Owner: <span className="font-medium text-foreground">{[booking.owner?.firstName, booking.owner?.lastName].filter(Boolean).join(" ") || [booking.lead?.owner?.firstName, booking.lead?.owner?.lastName].filter(Boolean).join(" ") || "—"}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={saving || cancelled}>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Update Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {BOOKING_STAGE_OPTIONS.filter((option) => option.value !== stage && option.value !== "CANCELLED").map((option) => (
                    <DropdownMenuItem key={option.value} onSelect={() => void changeStage(option.value)}>
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {!cancelled && (
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" disabled={cancellationPending} onClick={() => setCancelOpen(true)}>
                  <XCircle className="mr-1.5 h-4 w-4" />{cancellationPending ? "Cancellation Pending" : "Cancellation"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setNotesSignal((value) => value + 1)}>
                <StickyNote className="mr-1.5 h-4 w-4" />Add Notes
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTab("receipts")}>
                <Receipt className="mr-1.5 h-4 w-4" />Create Receipt
              </Button>
              {booking.lead && (isAdmin || isSuperAdmin) && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/leads/${booking.lead.id}`}><ExternalLink className="mr-1.5 h-4 w-4" />Lead</Link>
                </Button>
              )}
              <Button size="sm" className="bg-[#0b2545] text-white hover:bg-[#08182d]" disabled={previewing} onClick={() => void previewPdf()}>
                {previewing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}Preview PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => void downloadPdf()}>
                <Download className="mr-1.5 h-4 w-4" />Download PDF
              </Button>
            </div>
          </div>

          {cancellationPending && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Cancellation sent to MIS team for verification. Reason: {booking.cancellationReason}
            </p>
          )}
          {booking.cancellationStatus === "REJECTED" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              MIS rejected the last cancellation request{booking.cancellationReviewNote ? `: ${booking.cancellationReviewNote}` : "."}
            </p>
          )}
          <div className="flex w-full overflow-x-auto" role="list" aria-label="Booking status">
            {BOOKING_STAGE_OPTIONS.map((option, index) => {
              const isCancelStep = option.value === "CANCELLED";
              const active = option.value === stage;
              const done = !cancelled && index < currentIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="listitem"
                  disabled={saving || cancelled || isCancelStep}
                  onClick={() => void changeStage(option.value)}
                  className={cn(
                    "relative min-w-[100px] flex-1 px-4 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors",
                    "[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%,14px_50%)] first:[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)]",
                    active && isCancelStep && "bg-red-700 text-white",
                    active && !isCancelStep && "bg-gradient-to-r from-blue-600 to-blue-500 text-white",
                    !active && "bg-sky-100 text-[#1479a8] hover:bg-sky-200",
                  )}
                >
                  {(active || done) && <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5" />}{option.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-4">
          <TabsList className="border border-sky-100 bg-sky-50 text-[#1479a8] [&>button[data-state=active]]:bg-white [&>button[data-state=active]]:text-[#075d91]">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="payments">Payment &amp; Installment</TabsTrigger>
            <TabsTrigger value="receipts">Receipt</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <Card className="rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm">
              <CardContent className="p-5">
                <BookingDetailsBody booking={booking} onSaved={() => void load()} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments">
            {booking.lead && <LeadInstallments leadId={booking.lead.id} />}
          </TabsContent>
          <TabsContent value="receipts">
            {booking.lead && <LeadReceipts leadId={booking.lead.id} />}
          </TabsContent>
        </Tabs>
        {booking.lead && (
          <aside className="min-w-0 space-y-4">
            <StickyNotesCard recordId={booking.lead.id} canAdd openSignal={notesSignal} />
            <LeadActivityHistoryCard
              bookingId={booking.id}
              leadName={booking.bookingNumber}
              refreshKey={booking.id}
              canViewAuditHistory
            />
          </aside>
        )}
      </div>
      <PdfDocumentPreview preview={pdfPreview} onClose={closePdfPreview} />
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request booking cancellation</DialogTitle>
            <DialogDescription>The request goes to the MIS team. The booking is cancelled and the plot released only after MIS verifies it.</DialogDescription>
          </DialogHeader>
          <Textarea value={cancelNotes} onChange={(event) => setCancelNotes(event.target.value)} placeholder="Cancellation notes (required)" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Close</Button>
            <Button className="bg-red-700 text-white hover:bg-red-800" disabled={saving || cancelNotes.trim().length < 3} onClick={() => void submitCancellation()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Send to MIS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
