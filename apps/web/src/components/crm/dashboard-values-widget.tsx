"use client";

import * as React from "react";

export function DashboardValuesWidget({ widget }: { widget: { id: string; description?: string } }) {
  const dashboardId = widget.id.replace("dashboard-", "");
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(320);

  // The embedded page is same-origin, so its content height can drive the frame height
  // and every widget added to the dashboard stays visible.
  const syncHeight = React.useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const canvas = doc?.querySelector("[data-dashboard-canvas]");
    const measured = canvas instanceof HTMLElement ? canvas.scrollHeight : doc?.body?.scrollHeight;
    if (!measured) return;
    const next = Math.max(320, measured + 8);
    setHeight((current) => (Math.abs(current - next) > 2 ? next : current));
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(syncHeight, 800);
    return () => window.clearInterval(timer);
  }, [syncHeight]);

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <iframe
        ref={frameRef}
        title="Dashboard"
        onLoad={syncHeight}
        scrolling="no"
        src={`/dashboard/${encodeURIComponent(dashboardId)}?mode=view&embed=1`}
        style={{ height }}
        className="w-full border-0 bg-white"
      />
      <a
        href={`/dashboard/${encodeURIComponent(dashboardId)}?mode=view`}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute right-2 top-1 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-blue-600 hover:underline"
      >
        Open dashboard
      </a>
    </div>
  );
}
