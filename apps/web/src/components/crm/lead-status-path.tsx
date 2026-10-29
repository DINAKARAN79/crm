"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { LEAD_STATUS_DEFINITIONS } from "@dct-crm/shared";
import { useAuth } from "@/contexts/auth-context";

export function LeadStatusPath({ status }: { status: string }) {
  const { leadStatuses, getLeadStatusLabel } = useAuth();
  const currentLabel = getLeadStatusLabel(status);

  return (
    <ol
      aria-label={`Lead status: ${currentLabel}`}
      title="Status updates automatically."
      className="flex min-w-[850px] cursor-default gap-1"
    >
      {LEAD_STATUS_DEFINITIONS.map((step, index) => {
        const isCurrent = status.toUpperCase() === step.value;
        const configuredStatus = leadStatuses.find((configured) => configured.status === step.value);
        const isDisabled = configuredStatus ? !configuredStatus.enabled : false;
        return (
          <li
            key={step.value}
            aria-current={isCurrent ? "step" : undefined}
            className={`pointer-events-none flex min-h-11 flex-1 cursor-default select-none items-center justify-center gap-2 px-3 text-center text-xs font-semibold ${
              isCurrent ? "bg-[#197ca7] text-white" : "bg-[#edf1f6] text-slate-600"
            } ${isDisabled && !isCurrent ? "opacity-60" : ""}`}
            style={{
              clipPath: index === 0
                ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
            }}
          >
            {isCurrent && <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span className="whitespace-nowrap">{getLeadStatusLabel(step.value)}</span>
          </li>
        );
      })}
    </ol>
  );
}
