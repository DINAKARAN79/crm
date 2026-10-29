import * as React from "react";
import { cn } from "@/lib/utils";

export const listPageActionClassName = "h-11 shrink-0 px-5 max-md:w-full";

export function ListPageHeader({
  icon,
  title,
  subtitle,
  view,
  actions,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  view?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 text-blue-600 shadow-sm dark:border-sky-900 dark:from-slate-900 dark:to-slate-950 dark:text-sky-300">
          {icon}
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-8">
            <h1 className="m-0 basis-full text-[28px] font-bold leading-[1.2] tracking-tight text-[#075d91] dark:text-sky-100 sm:basis-auto">{title}</h1>
            {view}
          </div>
          {subtitle ? (
            <p className="m-0 mt-2 text-lg leading-[1.4] text-[#1479a8] dark:text-sky-300">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-center max-md:w-full">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
