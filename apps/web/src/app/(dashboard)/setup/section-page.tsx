"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Settings } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export interface SetupItem {
  label: string;
  description: string;
  href?: string;
}

export default function SetupSectionPage({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SetupItem[];
}) {
  const searchParams = useSearchParams();
  const { isSuperAdmin } = useAuth();
  const tenantId = isSuperAdmin ? searchParams.get("tenantId") : null;
  const scopedHref = (href: string) => tenantId
    ? `${href}${href.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(tenantId)}`
    : href;

  return (
    <div className="space-y-8">
      <div className="border-b border-sky-100 pb-6">
        <Link href={scopedHref("/setup")} className="inline-flex items-center gap-2 text-sm text-[#1479a8] hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Back to Setup
        </Link>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-[#278db8]">Setup</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[#075d91]">{title}</h1>
            <p className="mt-2 max-w-2xl text-[#1479a8]">{description}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 text-blue-600 shadow-sm"><Settings className="h-6 w-6" /></div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const content = (
            <>
              <div>
                <h2 className="font-bold text-[#075d91]">{item.label}</h2>
                <p className="mt-1 text-sm text-[#1479a8]">{item.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#278db8]" />
            </>
          );

          return item.href ? (
            <Link key={item.label} href={scopedHref(item.href)} className="flex items-center justify-between rounded-xl border border-sky-100 bg-gradient-to-br from-white to-[#f5fbff] p-5 shadow-sm hover:border-blue-400">
              {content}
            </Link>
          ) : (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-sky-100 bg-gradient-to-br from-white to-[#f5fbff] p-5 shadow-sm">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
