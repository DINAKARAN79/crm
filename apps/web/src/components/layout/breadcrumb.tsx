"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const BreadcrumbLabelContext = React.createContext<{
  labels: Record<string, string>;
  setLabel: (segment: string, label: string | null) => void;
} | null>(null);

export function BreadcrumbLabels({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const setLabel = React.useCallback((segment: string, label: string | null) => {
    setLabels((current) => {
      if (!label) {
        if (!(segment in current)) return current;
        const next = { ...current };
        delete next[segment];
        return next;
      }
      if (current[segment] === label) return current;
      return { ...current, [segment]: label };
    });
  }, []);

  return (
    <BreadcrumbLabelContext.Provider value={{ labels, setLabel }}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

export function useBreadcrumbLabel(segment: string | undefined, label: string | undefined) {
  const setLabel = React.useContext(BreadcrumbLabelContext)?.setLabel;
  React.useEffect(() => {
    if (!setLabel || !segment) return;
    setLabel(segment, label || null);
    return () => setLabel(segment, null);
  }, [setLabel, segment, label]);
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const pathname = usePathname();
  const labelOverrides = React.useContext(BreadcrumbLabelContext)?.labels;

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (items) return items;

    const segments = pathname.split("/").filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];
    const prefixesWithoutPage = ["/objects", "/profiles"];

    segments.forEach((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      const label = labelOverrides?.[segment] || segment
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      if (index < segments.length - 1 && prefixesWithoutPage.includes(href)) {
        breadcrumbs.push({ label, href: undefined });
      } else {
        breadcrumbs.push({ label, href });
      }
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <nav className={cn("flex items-center space-x-1 text-xs text-muted-foreground", className)}>
      <Link
        href="/home"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {breadcrumbs.map((breadcrumb, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="h-3.5 w-3.5" />
          {breadcrumb.href ? (
            <Link
              href={breadcrumb.href}
              className="hover:text-foreground transition-colors"
            >
              {breadcrumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{breadcrumb.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}