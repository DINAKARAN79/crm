"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KPICard } from "@/components/crm/dashboard-widgets";
import {
  Users,
  FileText,
  Calendar,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { analyticsApi, followUpApi, activityApi, homepageApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/date-format";

interface HomepageWidgetLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const defaultHomeWidgetIds = [
  "total-leads",
  "active-tasks",
  "upcoming-tasks",
  "recent-activity",
];
const homepageLayoutCanvasWidth = 12 * (85 + 8);

const isHomepageWidgetLayout = (item: unknown): item is HomepageWidgetLayout => {
  if (typeof item !== "object" || item === null) return false;
  if (!("id" in item) || !("x" in item) || !("y" in item) ||
      !("width" in item) || !("height" in item)) return false;

  return typeof item.id === "string" &&
    defaultHomeWidgetIds.includes(item.id) &&
    typeof item.x === "number" && Number.isFinite(item.x) &&
    typeof item.y === "number" && Number.isFinite(item.y) &&
    typeof item.width === "number" && Number.isFinite(item.width) &&
    typeof item.height === "number" && Number.isFinite(item.height);
};

export default function HomePage() {
  const {
    user,
    profile,
    roles = [],
    isSuperAdmin,
    isLoading: authLoading,
    hasPermission,
    hasEffectivePermission,
  } = useAuth();
  const hasAdminHomeAccess = isSuperAdmin ||
    profile?.name?.trim().toLowerCase() === "admin" ||
    roles.some((role) => role.trim().toLowerCase() === "admin");
  const router = useRouter();
  const canReadTasks = hasPermission("FollowUp", "read") || hasEffectivePermission("FOLLOW_UP_READ") || hasEffectivePermission("TASK_READ");
  const searchParams = useSearchParams();
  const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User" : "User";
  const [kpis, setKpis] = React.useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = React.useState<any[]>([]);
  const [recentActivities, setRecentActivities] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [homepageName, setHomepageName] = React.useState("Standard");
  const [homepageLayouts, setHomepageLayouts] = React.useState<HomepageWidgetLayout[] | null>(null);
  const requestedHomepageId = searchParams.get("homepage");

  React.useEffect(() => {
    if (authLoading || requestedHomepageId || !profile?.id || !profile.name) return;
    const profileSlug = profile.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const profileParams = new URLSearchParams({
      profileId: profile.id,
      profileLabel: profile.name,
    });
    router.replace(`/profiles/${profileSlug}?${profileParams}`);
  }, [authLoading, profile?.id, profile?.name, requestedHomepageId, router]);

  const fetchDashboardData = React.useCallback(async (homepageId: string | null, isCurrent: () => boolean = () => true) => {
    setIsLoading(true);

    try {
      const [leadsRes, tasksRes, activitiesRes] = await Promise.allSettled([
        analyticsApi.getLeads(),
        canReadTasks
          ? followUpApi.list({ limit: 5, sortBy: 'dueDate', sortOrder: 'asc', status: 'SCHEDULED' })
          : Promise.resolve({ data: { data: [] } }),
        activityApi.list({ limit: 5 }),
      ]);
      // Stale response after unmount or after a newer request started: do not
      // overwrite state (same active-flag pattern as the homepage effect below).
      if (!isCurrent()) return;
      const leadsData = leadsRes.status === 'fulfilled' ? leadsRes.value.data?.data : null;
      const tasksData = tasksRes.status === 'fulfilled' ? tasksRes.value.data?.data : [];
      const activitiesData = activitiesRes.status === 'fulfilled' ? activitiesRes.value.data?.data : [];
      setKpis([
        {
          title: "Total Leads",
          value: leadsData?.total ?? 0,
          icon: Users,
        },
        {
          title: "Scheduled Follow-ups",
          value: Array.isArray(tasksData) ? tasksData.length : 0,
          icon: FileText,
        },
      ]);

      if (Array.isArray(tasksData)) {
        setUpcomingTasks(tasksData.slice(0, 3));
      }

      if (Array.isArray(activitiesData)) {
        setRecentActivities(activitiesData.slice(0, 4));
      }
    } catch (error) {
      console.error("Failed to fetch home data:", error);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [canReadTasks]);

  React.useEffect(() => {
    let active = true;
    void fetchDashboardData(requestedHomepageId, () => active);
    return () => {
      active = false;
    };
  }, [fetchDashboardData, requestedHomepageId]);

  React.useEffect(() => {
    let active = true;
    const request = requestedHomepageId && hasAdminHomeAccess
      ? homepageApi.get(requestedHomepageId)
      : homepageApi.assigned();
    request
      .then((response) => {
        if (!active) return;
        const homepage = response.data?.data;
        if (!hasAdminHomeAccess && requestedHomepageId && homepage?.id !== requestedHomepageId) {
          router.replace("/home");
        }
        if (homepage) {
          setHomepageName(homepage.name);
          const layouts: HomepageWidgetLayout[] = Array.isArray(homepage.layout)
            ? homepage.layout.filter(isHomepageWidgetLayout)
            : [];
          setHomepageLayouts(layouts.length ? layouts : null);
        } else {
          setHomepageName("Standard");
          setHomepageLayouts(null);
        }
      })
      .catch(() => {
        if (active) {
          setHomepageName("Standard");
          setHomepageLayouts(null);
          if (!hasAdminHomeAccess && requestedHomepageId) router.replace("/home");
        }
      });
    return () => { active = false; };
  }, [hasAdminHomeAccess, requestedHomepageId, router]);


  const formatAmount = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount}`;
  };

  const getActivityTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case "call": return "bg-blue-100 text-blue-800";
      case "meeting": return "bg-green-100 text-green-800";
      case "email": return "bg-purple-100 text-purple-800";
      case "note": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
      case "urgent": return "bg-red-500";
      case "medium": return "bg-yellow-500";
      default: return "bg-green-500";
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const hasSelectedHomepage = Boolean(requestedHomepageId && homepageName && homepageName !== "Standard");
  const pageTitle = hasSelectedHomepage ? homepageName : `Welcome ${userName}`;
  const hasCustomLayout = Boolean(homepageLayouts?.length);
  const showsWidget = (widgetId: string) =>
    (canReadTasks || !["active-tasks", "upcoming-tasks"].includes(widgetId)) &&
    (!homepageLayouts || homepageLayouts.some((layout) => layout.id === widgetId));
  const getWidgetLayout = (widgetId: string) =>
    homepageLayouts?.find((layout) => layout.id === widgetId);
  const widgetStyle = (widgetId: string): React.CSSProperties => {
    const layout = getWidgetLayout(widgetId);
    return layout
      ? {
          position: "absolute",
          left: `${(layout.x / homepageLayoutCanvasWidth) * 100}%`,
          top: layout.y,
          width: `${(layout.width / homepageLayoutCanvasWidth) * 100}%`,
          height: layout.height,
        }
      : {};
  };
  const customCanvasHeight = homepageLayouts?.reduce(
    (height, layout) => Math.max(height, layout.y + layout.height + 24),
    720,
  ) ?? 0;

  if (!authLoading && !requestedHomepageId && profile?.id && profile.name) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="relative isolate flex min-h-[120px] flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-r from-[#2145b8] via-[#2865e7] to-[#35b9e8] px-6 py-5 text-white shadow-md">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[42%] h-56 w-56 rounded-full border-[18px] border-white/10" />
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-white/90 text-xl font-bold text-blue-700 shadow-sm">
            {userName.split(" ").map((part) => part[0] || "").join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight text-white">{pageTitle}</h1>
            <p className="mt-1 text-sm text-white/85">Profile overview and operational summary.</p>
            <div className="mt-3 h-1 w-9 rounded-full bg-cyan-200" />
          </div>
        </div>
        <div className="relative z-10 flex flex-wrap justify-end gap-2">
          {isSuperAdmin && (
            <Button variant="outline" className="border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white" asChild>
              <Link href="/admin/customize-home/create">
                Add Component
              </Link>
            </Button>
          )}
          {hasPermission("Lead", "create") && (
            <Button className="bg-blue-600 text-white shadow-md hover:bg-blue-700" asChild>
              <Link href="/leads/new">
                <Plus className="mr-2 h-4 w-4" />
                New Lead
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
        <p className="flex items-center gap-2 font-semibold text-slate-700">
          <Sparkles className="h-4 w-4 text-blue-500" />
          Here&apos;s what&apos;s happening today.
        </p>
        <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 font-medium text-blue-700 shadow-sm">
          {homepageName}
        </div>
      </div>

      <div
        className={hasCustomLayout ? "relative min-h-0" : "space-y-6"}
        style={hasCustomLayout ? { minHeight: customCanvasHeight } : undefined}
      >
      <div className={hasCustomLayout ? "contents" : "grid gap-4 md:grid-cols-2 lg:grid-cols-4"}>
          {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : kpis.filter((kpi) => {
              const widgetIds: Record<string, string> = {
                "Total Leads": "total-leads",
                "Scheduled Follow-ups": "active-tasks",
              };
              return showsWidget(widgetIds[kpi.title]);
            }).map((kpi) => {
              const widgetIds: Record<string, string> = {
                "Total Leads": "total-leads",
                "Scheduled Follow-ups": "active-tasks",
              };
              const widgetId = widgetIds[kpi.title];
              return <div
                key={kpi.title}
                className={hasCustomLayout ? "absolute h-full [&>*]:h-full" : ""}
                style={hasCustomLayout ? widgetStyle(widgetId) : undefined}
              >
                <KPICard {...kpi} />
              </div>;
            })}
      </div>

      {(showsWidget("upcoming-tasks") || showsWidget("recent-activity")) && <div className={hasCustomLayout ? "contents" : "grid gap-6 lg:grid-cols-3"}>
        {showsWidget("upcoming-tasks") && <div className={hasCustomLayout ? "absolute" : "lg:col-span-2"} style={widgetStyle("upcoming-tasks")}>
          <Card className="rounded-xl border-sky-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming Follow-ups</CardTitle>
              <Link href="/follow-ups" className="text-sm text-primary hover:underline">
                View All
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : upcomingTasks.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No upcoming follow-ups</p>
              ) : (
                <div className="space-y-3">
                  {upcomingTasks.map((task: any) => (
                    <div key={task.id} className="flex items-center justify-between rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3">
                      <div>
                        <p className="font-medium">{task.title || "Untitled follow-up"}</p>
                        <p className="text-sm text-muted-foreground">{task.owner ? `${task.owner.firstName || ""} ${task.owner.lastName || ""}`.trim() : "Unassigned"}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPriorityColor(task.priority || "low")}`}>
                          {task.priority || "Low"}
                        </span>
                        <p className="text-sm text-muted-foreground mt-1">{task.dueDate ? formatDate(task.dueDate) : "No due date"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>}

        {showsWidget("recent-activity") && <div className={hasCustomLayout ? "absolute h-full" : ""} style={widgetStyle("recent-activity")}>
          <Card className="rounded-xl border-sky-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentActivities.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity: any) => (
                    <div key={activity.id} className="flex items-center gap-3 rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${getActivityTypeColor(activity.type)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{activity.message || "Activity"}</p>
                        <p className="text-xs text-muted-foreground">{activity.type || "Update"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{activity.createdAt ? formatTimeAgo(activity.createdAt) : "Now"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>}
      </div>}

      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/leads/new">
                <Users className="h-5 w-5" />
                <span>Add Lead</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/site-visits">
                <Calendar className="h-5 w-5" />
                <span>Schedule Visit</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}