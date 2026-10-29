"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecordPageHeaderProps {
  objectLabel: string;
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  icon?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}

export function RecordPageHeader({
  objectLabel,
  title,
  subtitle,
  backHref,
  icon,
  badges,
  actions,
}: RecordPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={backHref} aria-label={`Back to ${objectLabel} list`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          {icon || <FileText className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {objectLabel}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}
