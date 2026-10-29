"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";
import { fetchAuthenticatedImage } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  BookOpenCheck,
  Contact,
  Building2,
  MapPin,
  FolderKanban,
  Building,
  BarChart3,
  Settings,
  ChevronRight,
  Clock3,
  FileCheck2,
  Database,
  X,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function getNavigationByProfile(
  profileName: string | undefined,
  roles: string[],
  hasEffectivePermission: (perm: string) => boolean,
  isSuperAdmin: boolean,
  isAdmin: boolean
): NavItem[] {
  void roles;

  const nav: NavItem[] = [{ title: "Home", href: "/home", icon: LayoutDashboard }];
  if (isSuperAdmin) {
    nav.push(
      { title: "Companies", href: "/admin/companies", icon: Building2 },
      { title: "Companies API", href: "/admin/companies?view=api", icon: Database },
      { title: "Custom Project Layouts", href: "/admin/custom-project-layouts", icon: MapPin },
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
      { title: "Reports", href: "/reports", icon: BarChart3 },
    );
    return nav;
  }

  const normalizedProfileName = profileName?.trim() || "";
  const isCrmProfile = /^crm(?:\s|$)/i.test(normalizedProfileName);

  if (!isCrmProfile && hasEffectivePermission("LEAD_READ")) {
    nav.push({ title: "Leads", href: "/leads", icon: Contact });
  }
  if (isCrmProfile || isSuperAdmin || isAdmin) {
    nav.push({ title: "Booking Details", href: "/bookings", icon: BookOpenCheck });
  }
  if (hasEffectivePermission("SITE_VISIT_READ")) {
    nav.push({ title: "Site Visits", href: "/site-visits", icon: MapPin });
  }
  if (/^mis(?:\s|$)/i.test(profileName?.trim() || "") || isSuperAdmin || isAdmin) {
    nav.push({ title: "MIS Approval", href: "/mis-approvals", icon: FileCheck2 });
  }
  if (profileName?.toLowerCase() !== "sales" && hasEffectivePermission("PROJECT_READ")) {
    nav.push({ title: "Projects", href: "/projects", icon: FolderKanban });
  }
  if (hasEffectivePermission("UNIT_READ")) {
    nav.push({ title: "Units", href: "/units", icon: Building });
  }
  // Dashboards nav is admin-only. DASHBOARD_READ alone is NOT sufficient — every
  // profile holds it because the home page API (homepages.ts) requires it.
  if ((isSuperAdmin || isAdmin) && (isSuperAdmin || hasEffectivePermission("DASHBOARD_READ"))) {
    nav.push({ title: "Dashboards", href: "/dashboards", icon: LayoutDashboard });
  }
  if (isSuperAdmin || hasEffectivePermission("REPORT_VIEW") || hasEffectivePermission("REPORT_READ")) {
    nav.push({ title: "Reports", href: "/reports", icon: BarChart3 });
  }
  if (hasEffectivePermission("FOLLOW_UP_READ")) {
    nav.push({ title: "Follow-ups", href: "/follow-ups", icon: Clock3 });
  }

  if (isSuperAdmin || isAdmin) {
    nav.push({ title: "Setup", href: "/setup", icon: Settings });
  }

  return nav;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { profile, roles, hasEffectivePermission, isSuperAdmin, isAdmin, tenant } = useAuth();
  const logoFile = (tenant as any)?.logo as string | undefined;
  const [logoUrl, setLogoUrl] = React.useState<string>();

  React.useEffect(() => {
    if (!logoFile) {
      setLogoUrl(undefined);
      return;
    }

    let active = true;
    let objectUrl: string | undefined;
    void fetchAuthenticatedImage(`/api/proxy/api/super-admin/logos/${logoFile}`)
      .then((url) => {
        objectUrl = url;
        if (active) setLogoUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Unable to load tenant logo", error);
        if (active) setLogoUrl(undefined);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoFile]);

  const navigation = getNavigationByProfile(
    profile?.name,
    roles,
    hasEffectivePermission,
    isSuperAdmin,
    isAdmin
  );

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    const matchesPath = pathname === path || pathname.startsWith(path + "/");
    if (!matchesPath) return false;
    if (query) return new URLSearchParams(query).get("view") === view;
    return !(path === "/admin/companies" && view === "api");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 w-64 max-w-[min(16rem,85vw)] overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#278db8_0%,#1479a8_55%,#075d91_100%)] text-white shadow-xl transition-[width,transform] duration-300 ease-in-out lg:w-14 lg:translate-x-0 lg:hover:w-60 lg:focus-within:w-60",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative z-10 flex h-16 items-center justify-center border-b border-white/15 px-2 lg:group-hover/sidebar:justify-between lg:group-hover/sidebar:px-4 lg:group-focus-within/sidebar:justify-between lg:group-focus-within/sidebar:px-4">
          <Link href="/home" aria-label={isSuperAdmin ? "CRM home" : `${tenant?.name || "CRM"} home`} className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={tenant?.name || "CRM"}
                className="h-7 w-7 rounded object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 shadow-sm">
                <span className="text-xs font-bold text-white">DCT</span>
              </div>
            )}
            <span className="hidden min-w-0 truncate text-sm font-semibold text-white lg:group-hover/sidebar:block lg:group-focus-within/sidebar:block">{isSuperAdmin ? "CRM" : tenant?.name || "CRM"}</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/15 hover:text-white lg:hidden">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="relative z-10 h-[calc(100vh-4rem)] py-3">
          <nav className="space-y-0.5 px-1 lg:px-0.5 lg:group-hover/sidebar:px-2 lg:group-focus-within/sidebar:px-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.title}
                title={item.title}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-white/15 hover:text-white lg:justify-center lg:px-0 lg:group-hover/sidebar:justify-start lg:group-hover/sidebar:px-2.5 lg:group-focus-within/sidebar:justify-start lg:group-focus-within/sidebar:px-2.5",
                  isActive(item.href)
                    ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/10"
                    : ""
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate lg:hidden lg:group-hover/sidebar:block lg:group-focus-within/sidebar:block">{item.title}</span>
                {isActive(item.href) && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 lg:group-hover/sidebar:block lg:group-focus-within/sidebar:block" />}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}