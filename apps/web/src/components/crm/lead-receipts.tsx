"use client";

import * as React from "react";
import { Download, FileCheck2, Loader2, Receipt, RotateCw } from "lucide-react";
import { bookingApi, receiptApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Applicant = { name?: string; salutation?: string };

interface ReceiptBooking {
  id: string;
  bookingNumber: string;
  status: string;
  bookingAmount: number;
  welcomeCallCompletedAt?: string | null;
  welcomeCallNotes?: string | null;
  firstApplicant: Applicant;
  project: { name: string };
  unit: { number: string; area?: number | null; type?: string | null };
  quotation: {
    quotationNumber: string;
    area: number;
    pricePerSqFt: number;
    totalPrice: number;
  };
}

interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  receivedFrom: string;
  amount: number;
  paymentMode: string;
  transactionId?: string | null;
  receivedDate: string;
  approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ISSUED";
  kind: "MIS_SUBMISSION" | "CRM_PAYMENT";
  approvalNote?: string | null;
  booking: {
    id: string;
    bookingNumber: string;
    project: { name: string };
    unit: { number: string; area?: number | null };
  };
}

type ReceiptForm = {
  bookingId: string;
  receiptDate: string;
  receivedFrom: string;
  amount: string;
  paymentMode: string;
  transactionId: string;
  receivedDate: string;
};

const paymentModes = ["Cash", "Cheque", "Bank Transfer", "UPI", "Card", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const currency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));

function fieldValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function ReceiptField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

export function LeadReceipts({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<ReceiptBooking[]>([]);
  const [receipts, setReceipts] = React.useState<ReceiptRecord[]>([]);
  const [form, setForm] = React.useState<ReceiptForm>({
    bookingId: "",
    receiptDate: today(),
    receivedFrom: "",
    amount: "",
    paymentMode: "Bank Transfer",
    transactionId: "",
    receivedDate: today(),
  });
  const [preview, setPreview] = React.useState<ReceiptForm | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [welcomeCallNotes, setWelcomeCallNotes] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [bookingResponse, receiptResponse] = await Promise.all([
        bookingApi.listForLead(leadId),
        receiptApi.listForLead(leadId),
      ]);
      const bookingRows = (bookingResponse.data.data || []) as ReceiptBooking[];
      setBookings(bookingRows);
      setReceipts((receiptResponse.data.data || []) as ReceiptRecord[]);
      setForm((current) => {
        const selected = bookingRows.find((booking) => booking.id === current.bookingId) || bookingRows.find((booking) => booking.status === "RESERVED" || booking.status === "BOOKED") || bookingRows[0];
        return {
          ...current,
          bookingId: selected?.id || "",
          receivedFrom: current.receivedFrom || fieldValue(selected?.firstApplicant?.name),
        };
      });
    } catch (cause) {
      console.error("Failed to load lead receipts:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      setLoadError(message || "Receipts could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedBooking = bookings.find((booking) => booking.id === (preview?.bookingId || form.bookingId));
  const selectedReceipts = receipts.filter((receipt) => receipt.booking.id === selectedBooking?.id);
  const approvedMisReceipt = selectedReceipts.some((receipt) => receipt.kind === "MIS_SUBMISSION" && receipt.approvalStatus === "APPROVED");
  const hasPendingMisReceipt = selectedReceipts.some((receipt) => receipt.kind === "MIS_SUBMISSION" && receipt.approvalStatus === "PENDING_APPROVAL");
  const approvedTotal = selectedReceipts
    .filter((receipt) => receipt.approvalStatus === "APPROVED" || receipt.approvalStatus === "ISSUED")
    .reduce((total, receipt) => total + receipt.amount, 0);
  const remainingBalance = Math.max(0, (selectedBooking?.quotation.totalPrice || 0) - approvedTotal);
  const updateField = (name: keyof ReceiptForm, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
    setPreview(null);
  };

  const generatePreview = () => {
    if (!form.bookingId || !form.receiptDate || !form.receivedDate || !form.receivedFrom.trim() || !form.amount || !form.paymentMode) {
      toast({ title: "Complete the required fields", description: "Enter the payment details before generating the receipt.", variant: "destructive" });
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a valid amount", description: "The receipt amount must be greater than zero.", variant: "destructive" });
      return;
    }
    setPreview({ ...form });
  };

  const confirmReceipt = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const response = await receiptApi.createForLead(leadId, {
        ...preview,
        amount: Number(preview.amount),
        transactionId: preview.transactionId.trim() || null,
      });
      const receipt = response.data.data as ReceiptRecord;
      setReceipts((current) => [receipt, ...current]);
      setPreview(null);
      setForm((current) => ({ ...current, amount: "", transactionId: "" }));
      toast({ title: "Sent to MIS approval", description: `${receipt.receiptNumber} was submitted with its quotation and booking details.` });
    } catch (cause) {
      console.error("Failed to submit receipt for approval:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast({ title: "Could not send for approval", description: message || "Please check the details and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createCustomerReceipt = async () => {
    if (!selectedBooking || remainingBalance <= 0) return;
    if (!form.receivedFrom.trim() || !form.receiptDate || !form.receivedDate || !form.paymentMode) {
      toast({ title: "Complete the required fields", description: "Enter the customer and payment details before creating the receipt.", variant: "destructive" });
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remainingBalance + 0.005) {
      toast({ title: "Enter a valid payment amount", description: `Enter an amount up to ${currency(remainingBalance)}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await receiptApi.createCustomerReceipt(leadId, selectedBooking.id, {
        receiptDate: form.receiptDate,
        receivedFrom: form.receivedFrom,
        amount,
        paymentMode: form.paymentMode,
        transactionId: form.transactionId.trim() || null,
        receivedDate: form.receivedDate,
      });
      const receipt = response.data.data as ReceiptRecord;
      setReceipts((current) => [receipt, ...current]);
      setForm((current) => ({ ...current, amount: "", transactionId: "" }));
      toast({ title: "Customer receipt created", description: `${receipt.receiptNumber} records a payment of ${currency(receipt.amount)}.` });
    } catch (cause) {
      console.error("Failed to create CRM customer receipt:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast({ title: "Could not create customer receipt", description: message || "Please check the details and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const completeWelcomeCall = async () => {
    if (!selectedBooking || remainingBalance > 0.005) return;
    setSaving(true);
    try {
      await bookingApi.completeWelcomeCall(leadId, selectedBooking.id, welcomeCallNotes.trim() || undefined);
      setBookings((current) => current.map((booking) => booking.id === selectedBooking.id
        ? { ...booking, status: "CONFIRMED", welcomeCallCompletedAt: new Date().toISOString(), welcomeCallNotes: welcomeCallNotes.trim() || null }
        : booking));
      toast({ title: "Welcome call completed", description: "The booking is confirmed and the unit is now marked booked." });
      await loadData();
    } catch (cause) {
      console.error("Failed to complete booking welcome call:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast({ title: "Could not complete welcome call", description: message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const downloadReceipt = async (receipt: ReceiptRecord) => {
    setDownloadingId(receipt.id);
    try {
      const response = await receiptApi.downloadPdf(leadId, receipt.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${receipt.receiptNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error("Failed to download receipt PDF:", cause);
      toast({ title: "Could not download receipt", description: "Please try again.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const errorMessage = loadError;
  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading receipts…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-rose-700">{errorMessage}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}><RotateCw className="mr-2 h-4 w-4" />Retry</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b bg-slate-50/70 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-rose-700" />
            {approvedMisReceipt ? "Customer Payment & Welcome Call" : "Create Receipt"}
          </CardTitle>
          <p className="text-xs text-slate-500">
            {approvedMisReceipt
              ? "Record the remaining customer payment after MIS approval. The welcome call can be completed once the balance is zero."
              : "Enter the payment details, generate a preview, then send the receipt and booking details to MIS."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-4">
          {bookings.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-800">A booking is needed first</p>
              <p className="mt-1 text-xs text-slate-500">Create a booking for this lead before recording a payment receipt.</p>
            </div>
          ) : (
            <>
              <ReceiptField label="Booking">
                <select
                  aria-label="Booking"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                  value={form.bookingId}
                  onChange={(event) => {
                    const booking = bookings.find((item) => item.id === event.target.value);
                    updateField("bookingId", event.target.value);
                    if (booking) setForm((current) => ({ ...current, bookingId: booking.id, receivedFrom: fieldValue(booking.firstApplicant?.name) }));
                    setPreview(null);
                  }}
                >
                  {bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.bookingNumber} · Plot {booking.unit.number} · {booking.status}</option>)}
                </select>
              </ReceiptField>

              {selectedBooking?.status === "CONFIRMED" ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Payment complete — welcome call successful</p>
                  <p className="mt-1 text-xs text-emerald-800">
                    Booking {selectedBooking.bookingNumber} is confirmed. The unit is marked booked.
                    {selectedBooking.welcomeCallCompletedAt ? ` Completed ${displayDate(selectedBooking.welcomeCallCompletedAt)}.` : ""}
                  </p>
                </div>
              ) : approvedMisReceipt ? (
                <>
                  <div className="grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-3">
                    <ReceiptSummary label="Quotation Total" value={currency(selectedBooking?.quotation.totalPrice || 0)} />
                    <ReceiptSummary label="Paid and Approved" value={currency(approvedTotal)} />
                    <ReceiptSummary label="Remaining Balance" value={currency(remainingBalance)} emphasized />
                  </div>
                  {remainingBalance > 0.005 ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <ReceiptField label="Receipt Date">
                          <Input type="date" value={form.receiptDate} onChange={(event) => updateField("receiptDate", event.target.value)} />
                        </ReceiptField>
                        <ReceiptField label="Received With Thanks From">
                          <Input value={form.receivedFrom} onChange={(event) => updateField("receivedFrom", event.target.value)} placeholder="Customer name" maxLength={200} />
                        </ReceiptField>
                        <ReceiptField label="Amount Received (INR)">
                          <Input type="number" min="0.01" max={remainingBalance} step="0.01" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} placeholder={`Up to ${currency(remainingBalance)}`} />
                        </ReceiptField>
                        <ReceiptField label="Mode of Payment">
                          <select
                            aria-label="Mode of Payment"
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                            value={form.paymentMode}
                            onChange={(event) => updateField("paymentMode", event.target.value)}
                          >
                            {paymentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                          </select>
                        </ReceiptField>
                        <ReceiptField label="Transaction ID">
                          <Input value={form.transactionId} onChange={(event) => updateField("transactionId", event.target.value)} placeholder="Optional reference number" maxLength={120} />
                        </ReceiptField>
                        <ReceiptField label="Received Date">
                          <Input type="date" value={form.receivedDate} onChange={(event) => updateField("receivedDate", event.target.value)} />
                        </ReceiptField>
                      </div>
                      <div className="flex justify-end border-t pt-4">
                        <Button type="button" disabled={saving} onClick={() => void createCustomerReceipt()} className="bg-rose-700 text-white hover:bg-rose-800">
                          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                          {saving ? "Creating…" : "Create Customer Receipt"}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">Record a full or partial payment. Each approved receipt updates the overall balance and installment progress.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Full quotation amount received</p>
                        <p className="mt-1 text-xs text-emerald-800">Complete the customer welcome call to confirm this booking.</p>
                      </div>
                      <ReceiptField label="Welcome Call Notes (optional)">
                        <Textarea value={welcomeCallNotes} onChange={(event) => setWelcomeCallNotes(event.target.value)} maxLength={1000} placeholder="Add a short call outcome note" />
                      </ReceiptField>
                      <div className="flex justify-end">
                        <Button type="button" disabled={saving} onClick={() => void completeWelcomeCall()} className="bg-emerald-700 text-white hover:bg-emerald-800">
                          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                          {saving ? "Saving…" : "Mark Welcome Call Successful"}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : hasPendingMisReceipt ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">Waiting for MIS approval</p>
                  <p className="mt-1 text-xs text-amber-800">The CRM customer receipt becomes available after MIS approves the initial receipt.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedBooking?.status !== "RESERVED" && selectedBooking?.status !== "BOOKED" ? (
                    <p className="rounded-md border bg-slate-50 p-4 text-sm text-slate-600">This booking is not active and cannot receive a receipt.</p>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <ReceiptField label="Receipt Date">
                          <Input type="date" value={form.receiptDate} onChange={(event) => updateField("receiptDate", event.target.value)} />
                        </ReceiptField>
                        <ReceiptField label="Received With Thanks From">
                          <Input value={form.receivedFrom} onChange={(event) => updateField("receivedFrom", event.target.value)} placeholder="Customer name" maxLength={200} />
                        </ReceiptField>
                        <ReceiptField label="Amount (INR)">
                          <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} placeholder="Enter payment amount" />
                        </ReceiptField>
                        <ReceiptField label="Mode of Payment">
                          <select
                            aria-label="Mode of Payment"
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                            value={form.paymentMode}
                            onChange={(event) => updateField("paymentMode", event.target.value)}
                          >
                            {paymentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                          </select>
                        </ReceiptField>
                        <ReceiptField label="Transaction ID">
                          <Input value={form.transactionId} onChange={(event) => updateField("transactionId", event.target.value)} placeholder="Optional reference number" maxLength={120} />
                        </ReceiptField>
                        <ReceiptField label="Received Date">
                          <Input type="date" value={form.receivedDate} onChange={(event) => updateField("receivedDate", event.target.value)} />
                        </ReceiptField>
                      </div>
                      <div className="flex justify-end border-t pt-4">
                        <Button type="button" onClick={generatePreview} className="bg-rose-700 text-white hover:bg-rose-800">
                          <FileCheck2 className="mr-2 h-4 w-4" />Generate Receipt
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {preview && selectedBooking && (
        <Card className="overflow-hidden border-rose-200">
          <div className="border-b bg-rose-50 px-5 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Receipt Preview</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedBooking.project.name}</h2>
            <p className="mt-1 text-sm text-slate-600">Payment Receipt · {selectedBooking.bookingNumber}</p>
          </div>
          <CardContent className="p-5">
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <ReceiptSummary label="Receipt Date" value={preview.receiptDate} date />
              <ReceiptSummary label="Received With Thanks From" value={preview.receivedFrom} />
              <ReceiptSummary label="Plot No." value={selectedBooking.unit.number} />
              <ReceiptSummary label="Area" value={selectedBooking.unit.area ? `${selectedBooking.unit.area.toLocaleString("en-IN")} sq ft` : "—"} />
              <ReceiptSummary label="Rate" value={currency(selectedBooking.quotation.pricePerSqFt)} />
              <ReceiptSummary label="Amount Received" value={currency(Number(preview.amount))} emphasized />
              <ReceiptSummary label="Mode of Payment" value={preview.paymentMode} />
              <ReceiptSummary label="Transaction ID" value={preview.transactionId || "—"} />
              <ReceiptSummary label="Received Date" value={preview.receivedDate} date />
              <ReceiptSummary label="Quotation Total" value={currency(selectedBooking.quotation.totalPrice)} />
            </div>
            <p className="mt-5 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              The quotation, booking, and payment details will be sent together to MIS. A receipt is available to download after MIS approval.
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" disabled={saving} onClick={() => void confirmReceipt()} className="bg-rose-700 text-white hover:bg-rose-800">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                {saving ? "Sending…" : "Send to Approval"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-slate-600" />Receipts
            <Badge variant="secondary" className="ml-1">{receipts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No receipts have been submitted for this lead.</p>
          ) : (
            <div className="divide-y">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-rose-50 text-rose-700"><Receipt className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{receipt.receiptNumber} <span className="font-normal text-slate-500">· {receipt.booking.bookingNumber}</span></p>
                    <p className="mt-0.5 text-xs text-slate-500">Plot {receipt.booking.unit.number} · {receipt.receivedFrom} · {receipt.paymentMode} · {displayDate(receipt.receivedDate)}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{currency(receipt.amount)}</p>
                  <Badge variant={receipt.approvalStatus === "APPROVED" || receipt.approvalStatus === "ISSUED" ? "default" : "secondary"}>
                    {receipt.kind === "CRM_PAYMENT" ? "Customer payment" : "MIS submission"} · {receipt.approvalStatus === "PENDING_APPROVAL" ? "Pending MIS" : receipt.approvalStatus}
                  </Badge>
                  {(receipt.approvalStatus === "APPROVED" || receipt.approvalStatus === "ISSUED") && (
                    <Button type="button" size="sm" variant="outline" disabled={downloadingId === receipt.id} onClick={() => void downloadReceipt(receipt)}>
                      {downloadingId === receipt.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      PDF
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptSummary({ label, value, date = false, emphasized = false }: { label: string; value: string; date?: boolean; emphasized?: boolean }) {
  const formatted = date ? displayDate(value) : value;
  return (
    <div className="border-b border-slate-100 pb-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${emphasized ? "font-bold text-rose-700" : "font-medium text-slate-800"}`}>{formatted}</p>
    </div>
  );
}
