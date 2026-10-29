import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  FileText,
  Calendar,
} from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
}

export function KPICard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  isLoading,
}: KPICardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const visualStyles: Record<string, { card: string; icon: string; glow: string }> = {
    "Total Leads": {
      card: "border-sky-200 bg-gradient-to-br from-white via-white to-sky-50",
      icon: "bg-gradient-to-br from-sky-400 to-blue-700 text-white",
      glow: "bg-sky-100/70",
    },
    Opportunities: {
      card: "border-teal-200 bg-gradient-to-br from-white via-white to-teal-50",
      icon: "bg-gradient-to-br from-cyan-400 to-teal-600 text-white",
      glow: "bg-teal-100/70",
    },
    "Pipeline Value": {
      card: "border-violet-200 bg-gradient-to-br from-white via-white to-violet-50",
      icon: "bg-gradient-to-br from-violet-400 to-purple-700 text-white",
      glow: "bg-violet-100/70",
    },
    "Active Tasks": {
      card: "border-blue-200 bg-gradient-to-br from-white via-white to-blue-50",
      icon: "bg-gradient-to-br from-blue-400 to-indigo-700 text-white",
      glow: "bg-blue-100/70",
    },
  };
  const visualStyle = visualStyles[title] || {
    card: "border-sky-100 bg-white",
    icon: "bg-primary text-primary-foreground",
    glow: "bg-sky-100/50",
  };

  return (
    <Card className={cn("relative isolate min-h-[136px] overflow-hidden rounded-xl shadow-sm", visualStyle.card)}>
      <div aria-hidden="true" className={cn("pointer-events-none absolute -bottom-9 right-5 h-24 w-24 rounded-full", visualStyle.glow)} />
      <CardContent className="relative z-10 flex min-h-[136px] items-center justify-between p-4 sm:p-5">
        <div>
          <div>
            <p className="text-[13px] font-medium text-slate-700">{title}</p>
            <p className="mt-2 text-3xl font-bold leading-none tracking-tight text-slate-900">{value}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {change >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={cn(
                    "text-sm font-medium",
                    change >= 0 ? "text-green-500" : "text-red-500"
                  )}
                >
                  {change >= 0 ? "+" : ""}
                  {change}%
                </span>
                {changeLabel && (
                  <span className="text-sm text-muted-foreground">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={cn("relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md ring-1 ring-white/40", visualStyle.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

interface MiniChartProps {
  data: number[];
  color?: string;
  height?: number;
}

export function MiniChart({ data, color = "#3b82f6", height = 40 }: MiniChartProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "call" | "email" | "meeting" | "task";
}

interface ActivityListProps {
  activities: ActivityItem[];
  isLoading?: boolean;
}

const activityColors: Record<string, string> = {
  call: "bg-blue-100 text-blue-800",
  email: "bg-green-100 text-green-800",
  meeting: "bg-purple-100 text-purple-800",
  task: "bg-orange-100 text-orange-800",
};

export function ActivityList({ activities, isLoading }: ActivityListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3">
            <div
              className={cn(
                "p-2 rounded-full",
                activityColors[activity.type]
              )}
            >
              {activity.type === "call" && <FileText className="h-4 w-4" />}
              {activity.type === "email" && <FileText className="h-4 w-4" />}
              {activity.type === "meeting" && <Calendar className="h-4 w-4" />}
              {activity.type === "task" && <FileText className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <p className="font-medium">{activity.title}</p>
              <p className="text-sm text-muted-foreground">{activity.description}</p>
              <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface PipelineSummaryProps {
  stages: { name: string; count: number; value: number }[];
  isLoading?: boolean;
}

export function PipelineSummary({ stages, isLoading }: PipelineSummaryProps) {
  const totalValue = stages.reduce((sum, stage) => sum + stage.value, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-sky-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          Pipeline Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage) => (
          <div key={stage.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="capitalize">{stage.name.replace("-", " ")}</span>
              <span className="text-muted-foreground">
                {stage.count} • ₹{stage.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400"
                style={{
                  width: `${totalValue > 0 ? (stage.value / totalValue) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
