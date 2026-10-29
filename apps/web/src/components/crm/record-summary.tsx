
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface RecordSummaryItem {
  label: string;
  value: React.ReactNode;
}

export function RecordSummary({ items }: { items: RecordSummaryItem[] }) {
  return (
    <Card>
      <CardContent className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-b pb-2 last:border-b-0 sm:last:border-b-0 lg:border-b-0 lg:pb-0">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <div className="mt-1 truncate text-sm font-medium" title={typeof item.value === "string" ? item.value : undefined}>
              {item.value === null || item.value === undefined || item.value === "" ? "—" : item.value}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
