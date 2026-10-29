"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, CreditCard, Loader2, RotateCw } from "lucide-react";
import { quotationScheduleAmounts } from "@dct-crm/shared";
import { bookingApi, receiptApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Installment {
  milestone: string;
  percentage: number;
  dueMonths?: number;
  dueDays?: number;
}

interface InstallmentBooking {
  id: string;
  bookingNumber: string;
  status: string;
  createdAt: string;
  firstApplicant?: { name?: string };
  quotation: {
    quotationNumber: string;
    totalPrice: number;
    paymentPlanName: string;
    paymentPlan: { installments?: Installment[] };
  };
}

interface InstallmentReceipt {
  amount: number;
  kind: "MIS_SUBMISSION" | "CRM_PAYMENT";
  installmentIndex?: number | null;
  approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ISSUED";
  receivedDate: string;
  booking: { id: string };
}

interface ScheduleRow extends Installment {
  index: number;
  amount: number;
  paid: number;
  dueDate: Date;
}

const paymentModes = ["Cash", "Cheque", "Bank Transfer", "UPI", "Card", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const currency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
const displayDate = (value: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));

export function LeadInstallments({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<InstallmentBooking[]>([]);
  const [receipts, setReceipts] = React.useState<InstallmentReceipt[]>([]);
  const [bookingId, setBookingId] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [amount, setAmount] = React.useState("");
  const [receiptDate, setReceiptDate] = React.useState(today());
  const [receivedDate, setReceivedDate] = React.useState(today());
  const [receivedFrom, setReceivedFrom] = React.useState("");
  const [paymentMode, setPaymentMode] = React.useState("Bank Transfer");
  const [transactionId, setTransactionId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [bookingResponse, receiptResponse] = await Promise.all([
        bookingApi.listForLead(leadId),
        receiptApi.listForLead(leadId),
      ]);
      const bookingRows = (bookingResponse.data.data || []) as InstallmentBooking[];
      const receiptRows = (receiptResponse.data.data || []) as InstallmentReceipt[];
      setBookings(bookingRows);
      setReceipts(receiptRows);
      setBookingId((current) => bookingRows.some((booking) => booking.id === current)
        ? current
        : bookingRows.find((booking) => booking.status === "RESERVED" || booking.status === "BOOKED")?.id || bookingRows[0]?.id || "");
      setReceivedFrom((current) => current || bookingRows.find((booking) => booking.id === bookingId)?.firstApplicant?.name || "");
    } catch (cause) {
      console.error("Failed to load installment schedule:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      setLoadError(message || "Installments could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, leadId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const booking = bookings.find((item) => item.id === bookingId);
  const bookingReceipts = receipts
    .filter((receipt) => receipt.booking.id === bookingId && (receipt.approvalStatus === "APPROVED" || receipt.approvalStatus === "ISSUED"))
    .sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());
  const plan = booking?.quotation.paymentPlan?.installments || [];
  const scheduleAmounts = quotationScheduleAmounts(booking?.quotation.totalPrice || 0, plan.map((installment) => installment.percentage));
  const schedule: ScheduleRow[] = plan.map((installment, index) => {
    const dueDate = new Date(booking!.createdAt);
    if (installment.dueDays != null && Number.isFinite(installment.dueDays)) {
      dueDate.setDate(dueDate.getDate() + installment.dueDays);
    } else {
      dueDate.setMonth(dueDate.getMonth() + (installment.dueMonths || 0));
    }
    return { ...installment, index, amount: scheduleAmounts[index] || 0, paid: 0, dueDate };
  });
  for (const receipt of bookingReceipts) {
    if (receipt.kind === "CRM_PAYMENT" && receipt.installmentIndex != null) {
      const row = schedule.find((item) => item.index === receipt.installmentIndex);
      if (row) row.paid += receipt.amount;
      continue;
    }
    let unallocated = receipt.amount;
    for (const row of schedule) {
      if (unallocated <= 0.005) break;
      const payment = Math.min(Math.max(0, row.amount - row.paid), unallocated);
      row.paid += payment;
      unallocated -= payment;
    }
  }
  const totalPaid = bookingReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const outstanding = Math.max(0, (booking?.quotation.totalPrice || 0) - totalPaid);
  const selectedInstallment = schedule.find((item) => item.index === selectedIndex);
  const selectedBalance = selectedInstallment ? Math.max(0, selectedInstallment.amount - selectedInstallment.paid) : 0;

  const startPayment = (installment: ScheduleRow) => {
    setSelectedIndex(installment.index);
    setAmount(Math.max(0, installment.amount - installment.paid).toFixed(2));
    setReceivedFrom(booking?.firstApplicant?.name || "");
  };

  const recordPayment = async () => {
    if (!booking || !selectedInstallment || !receivedFrom.trim() || !receiptDate || !receivedDate) {
      toast({ title: "Complete the required fields", description: "Select an installment and enter the customer payment details.", variant: "destructive" });
      return;
    }
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > selectedBalance + 0.005) {
      toast({ title: "Enter a valid installment payment", description: `Enter an amount up to ${currency(selectedBalance)}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await receiptApi.createCustomerReceipt(leadId, booking.id, {
        receiptDate,
        receivedFrom: receivedFrom.trim(),
        amount: paymentAmount,
        paymentMode,
        transactionId: transactionId.trim() || null,
        receivedDate,
        installmentIndex: selectedInstallment.index,
      });
      const receipt = response.data.data as InstallmentReceipt;
      setReceipts((current) => [receipt, ...current]);
      setSelectedIndex(null);
      setAmount("");
      setTransactionId("");
      toast({ title: "Installment payment recorded", description: `${currency(paymentAmount)} was recorded for ${selectedInstallment.milestone}.` });
    } catch (cause) {
      console.error("Failed to record installment payment:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast({ title: "Could not record installment payment", description: message || "Please refresh the schedule and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading installments…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-rose-700">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}><RotateCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader className="border-b bg-slate-50/70 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-indigo-700" />Installment Schedule</CardTitle>
          <p className="text-xs text-slate-500">View each quotation milestone and record payments against its outstanding amount.</p>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {bookings.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-slate-500">A booking is needed before installments can be tracked.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Booking</Label>
                <select
                  aria-label="Booking"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                  value={bookingId}
                  onChange={(event) => {
                    const nextBookingId = event.target.value;
                    setBookingId(nextBookingId);
                    setSelectedIndex(null);
                    setReceivedFrom(bookings.find((item) => item.id === nextBookingId)?.firstApplicant?.name || "");
                  }}
                >
                  {bookings.map((item) => <option key={item.id} value={item.id}>{item.bookingNumber} · {item.quotation.quotationNumber} · {item.status}</option>)}
                </select>
              </div>
              {booking && (
                <>
                  <div className="grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-3">
                    <Summary label="Payment Plan" value={booking.quotation.paymentPlanName} />
                    <Summary label="Quotation Total" value={currency(booking.quotation.totalPrice)} />
                    <Summary label="Balance Remaining" value={currency(outstanding)} emphasized />
                  </div>
                  {plan.length === 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No installment schedule is saved on this quotation.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr><th className="px-4 py-3">Milestone</th><th className="px-4 py-3">Due Date</th><th className="px-4 py-3">Schedule Amount</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {schedule.map((item) => {
                            const balance = Math.max(0, item.amount - item.paid);
                            const isPaid = balance <= 0.005;
                            return (
                              <tr key={item.index}>
                                <td className="px-4 py-3"><span className="font-medium text-slate-900">{item.milestone}</span><span className="block text-xs text-slate-500">{item.percentage}% of quotation</span></td>
                                <td className="px-4 py-3 text-slate-600">{displayDate(item.dueDate)}</td>
                                <td className="px-4 py-3">{currency(item.amount)}</td>
                                <td className="px-4 py-3">{currency(item.paid)}</td>
                                <td className="px-4 py-3 font-medium">{currency(balance)}</td>
                                <td className="px-4 py-3"><Badge variant={isPaid ? "default" : "secondary"}>{isPaid ? "Paid" : item.paid > 0 ? "Partially paid" : item.dueDate < new Date() ? "Overdue" : "Pending"}</Badge></td>
                                <td className="px-4 py-3 text-right">
                                  {!isPaid && (booking.status === "RESERVED" || booking.status === "BOOKED") && outstanding > 0.005 && (
                                    <Button type="button" size="sm" variant="outline" onClick={() => startPayment(item)}><CreditCard className="mr-1.5 h-3.5 w-3.5" />Record payment</Button>
                                  )}
                                  {isPaid && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selectedInstallment && selectedBalance > 0.005 && (booking.status === "RESERVED" || booking.status === "BOOKED") && (
                    <div className="space-y-4 rounded-md border border-indigo-200 bg-indigo-50/60 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Record payment · {selectedInstallment.milestone}</p>
                        <p className="mt-1 text-xs text-slate-600">Outstanding on this installment: {currency(selectedBalance)}</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Amount Received (INR)"><Input type="number" min="0.01" max={selectedBalance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
                        <Field label="Received From"><Input value={receivedFrom} onChange={(event) => setReceivedFrom(event.target.value)} maxLength={200} /></Field>
                        <Field label="Receipt Date"><Input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></Field>
                        <Field label="Payment Mode"><select aria-label="Payment Mode" className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></Field>
                        <Field label="Transaction ID"><Input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength={120} placeholder="Optional reference" /></Field>
                        <Field label="Received Date"><Input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></Field>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setSelectedIndex(null)}>Cancel</Button>
                        <Button type="button" disabled={saving} onClick={() => void recordPayment()} className="bg-indigo-700 text-white hover:bg-indigo-800">
                          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                          {saving ? "Saving…" : "Save Installment Payment"}
                        </Button>
                      </div>
                    </div>
                  )}
                  {booking.status !== "RESERVED" && booking.status !== "BOOKED" && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">This booking is confirmed. Installment progress is read-only.</p>}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-sm ${emphasized ? "font-bold text-rose-700" : "font-medium text-slate-800"}`}>{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium text-slate-700">{label}</Label>{children}</div>;
}
