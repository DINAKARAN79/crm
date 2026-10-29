"use client";

import * as React from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface ProjectMapProps {
  latitude: number;
  longitude: number;
  title: string;
  interactive?: boolean;
  onPositionChange?: (latitude: number, longitude: number) => void;
  className?: string;
}

const pinIcon = L.divIcon({
  className: "project-map-pin",
  html: '<span aria-hidden="true"></span>',
  iconSize: [24, 32],
  iconAnchor: [12, 30],
});

function RecenterMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([latitude, longitude]);
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [latitude, longitude, map]);
  return null;
}

function SelectMapPoint({ onPositionChange }: { onPositionChange: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onPositionChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function ProjectMapCanvas({
  latitude,
  longitude,
  title,
  interactive = false,
  onPositionChange,
  className,
}: ProjectMapProps) {
  const position: L.LatLngExpression = [latitude, longitude];
  const handleDrag = (event: L.LeafletEvent) => {
    const point = (event.target as L.Marker).getLatLng();
    onPositionChange?.(point.lat, point.lng);
  };

  return (
    <div className={`project-map relative z-0 overflow-hidden rounded-md border border-slate-200 ${className || "h-72 w-full"}`}>
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap latitude={latitude} longitude={longitude} />
        {interactive && onPositionChange && <SelectMapPoint onPositionChange={onPositionChange} />}
        <Marker
          position={position}
          icon={pinIcon}
          draggable={interactive}
          eventHandlers={interactive ? { dragend: handleDrag } : undefined}
        >
          <Popup>{title}<br />{latitude.toFixed(6)}, {longitude.toFixed(6)}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}