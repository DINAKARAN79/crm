"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const ProjectMapCanvas = dynamic(() => import("./project-map-canvas"), {
  ssr: false,
  loading: () => <div className="h-full min-h-64 animate-pulse bg-muted" />,
});

interface ProjectMapProps {
  latitude: number;
  longitude: number;
  title: string;
  interactive?: boolean;
  onPositionChange?: (latitude: number, longitude: number) => void;
  className?: string;
}

export function ProjectMap(props: ProjectMapProps) {
  return <ProjectMapCanvas {...props} />;
}