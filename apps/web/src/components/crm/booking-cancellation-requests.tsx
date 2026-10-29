"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import { bookingApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface CancellationRequest {
  id: string;
  bookingNumber: string;
  cancellationReason: string | null;
  cancellationRequestedAt: string | null;
  lead: { id: string; leadNumber: string };
  project: { name: string };
  unit: { number: string };
  quotation: { customerName: string };
}

export function BookingCancellationRequests() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<CancellationRequest[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await bookingApi.listCancellationRequests();
      setItems((response.data.data || []) as CancellationRequest[]);
    } catch {
      setItems([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const review = async (item: CancellationRequest, decision: "APPROVE" | "REJECT") => {
    setBusyId(item.id);
    try {
      await bookingApi.reviewCancellation(item.id, decision);
      toast({ title: decision === "APPROVE" ? "Booking cancelled and plot released" : "Cancellation rejected" });
      await load();
    } catch {
      toast({ title: "Could not review cancellation", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <Card className="border-red-200">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Booking cancellation requests ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{item.bookingNumber} · {item.quotation.customerName}</p>
              <p className="text-xs text-muted-foreground">{item.project.name} · {item.unit.number} · <Link className="text-[#1479a8] hover:underline" href={`/bookings/${item.id}`}>Open booking</Link></p>
              <p className="mt-1 text-xs">Notes: {item.cancellationReason}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void review(item, "REJECT")}>
                <X className="mr-1.5 h-4 w-4" />Reject
              </Button>
              <Button size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={busyId !== null} onClick={() => void review(item, "APPROVE")}>
                {busyId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Verify & Cancel
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
