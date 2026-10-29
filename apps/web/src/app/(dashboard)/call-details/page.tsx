import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CallDetailsIndexPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Phone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Call Details</p>
          <h1 className="text-lg font-semibold">Call records are linked to leads</h1>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Open Call Details from a Lead</CardTitle>
          <CardDescription>
            Call records are viewed from the Call Details tab on each lead. Select a lead to view its call history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/leads">
              Open Leads
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
