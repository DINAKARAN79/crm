"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectApi } from "@/lib/api";
import { ProjectMap } from "./project-map";

interface ProjectLocationFieldsProps {
  idPrefix: string;
  address: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  onAddressChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
}

export function ProjectLocationFields(props: ProjectLocationFieldsProps) {
  const [mapUrl, setMapUrl] = React.useState("");
  const [isParsingUrl, setIsParsingUrl] = React.useState(false);
  const [isGeocoding, setIsGeocoding] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const requestId = React.useRef(0);
  const latitude = Number(props.latitude);
  const longitude = Number(props.longitude);
  const hasCoordinates = Boolean(props.latitude.trim() && props.longitude.trim() &&
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);

  React.useEffect(() => {
    if (!mapUrl.trim()) return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        setIsParsingUrl(true);
        const response = await projectApi.parseMapUrl(mapUrl.trim());
        if (!active || !response.data?.success || !response.data.data) return;
        const point = response.data.data;
        props.onLatitudeChange(String(point.latitude));
        props.onLongitudeChange(String(point.longitude));
        setMessage("Coordinates loaded from Google Maps. Looking up the location name...");
      } catch (error: any) {
        if (active) setMessage(error?.response?.data?.error || "Could not read coordinates from this Google Maps URL.");
      } finally {
        if (active) setIsParsingUrl(false);
      }
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [mapUrl]);

  React.useEffect(() => {
    if (!hasCoordinates) return;

    const currentRequest = ++requestId.current;
    const timeout = window.setTimeout(async () => {
      try {
        setIsGeocoding(true);
        setMessage("Looking up the location name...");
        const response = await projectApi.reverseGeocode(latitude, longitude);
        if (currentRequest !== requestId.current) return;
        const result = response.data?.data;
        if (!response.data?.success || !result?.locationName) {
          throw new Error(response.data?.error || "No location name was found for these coordinates.");
        }
        props.onAddressChange(result.locationName);
        if (result.city) props.onCityChange(result.city);
        if (result.state) props.onStateChange(result.state);
        setMessage(`Location updated: ${result.locationName}`);
      } catch (error: any) {
        if (currentRequest === requestId.current) {
          const reason = error?.response?.data?.error || error?.message || "Location lookup failed.";
          setMessage(`${reason} The previous location name was kept.`);
        }
      } finally {
        if (currentRequest === requestId.current) setIsGeocoding(false);
      }
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [props.latitude, props.longitude]);

  const updatePoint = (nextLatitude: number, nextLongitude: number) => {
    props.onLatitudeChange(nextLatitude.toFixed(7));
    props.onLongitudeChange(nextLongitude.toFixed(7));
  };

  return (
    <div className="grid gap-4 py-2 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${props.idPrefix}-address`}>Location</Label>
        <Input id={`${props.idPrefix}-address`} value={props.address} onChange={(event) => props.onAddressChange(event.target.value)} maxLength={500} placeholder="Location name is filled from the selected point" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${props.idPrefix}-city`}>City</Label>
        <Input id={`${props.idPrefix}-city`} value={props.city} onChange={(event) => props.onCityChange(event.target.value)} maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${props.idPrefix}-state`}>State / region</Label>
        <Input id={`${props.idPrefix}-state`} value={props.state} onChange={(event) => props.onStateChange(event.target.value)} maxLength={100} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${props.idPrefix}-map-url`}>Google Maps URL</Label>
        <Input id={`${props.idPrefix}-map-url`} type="url" value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} placeholder="Paste a Google Maps URL, including a short share link" />
        {isParsingUrl && <p className="text-xs text-muted-foreground">Resolving map URL...</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${props.idPrefix}-latitude`}>Latitude</Label>
        <Input id={`${props.idPrefix}-latitude`} type="number" step="any" min="-90" max="90" value={props.latitude} onChange={(event) => props.onLatitudeChange(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${props.idPrefix}-longitude`}>Longitude</Label>
        <Input id={`${props.idPrefix}-longitude`} type="number" step="any" min="-180" max="180" value={props.longitude} onChange={(event) => props.onLongitudeChange(event.target.value)} />
      </div>
      {hasCoordinates && (
        <div className="sm:col-span-2">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {isGeocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            {message || "Click the map or drag the pin to choose an exact point."}
          </p>
          <ProjectMap latitude={latitude} longitude={longitude} title={props.address || "Project location"} interactive onPositionChange={updatePoint} className="h-64 w-full" />
          <p className="mt-1 text-xs text-muted-foreground">{latitude.toFixed(6)}, {longitude.toFixed(6)}. Drag the pin to move it. Scroll this window to move up and down.</p>
        </div>
      )}
    </div>
  );
}