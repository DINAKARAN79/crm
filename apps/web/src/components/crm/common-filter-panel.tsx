"use client";

import * as React from "react";
import { CalendarDays, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommonFilterPanel({
  children,
  onReset,
  resetLabel = "Reset filters",
  className,
}: {
  children: React.ReactNode;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("crm-filter-panel", className)}>
      {children}
      {onReset && (
        <div className="crm-filter-actions">
          <button type="button" className="crm-filter-reset" onClick={onReset}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {resetLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterLabel({
  htmlFor,
  icon: Icon,
  children,
}: {
  htmlFor: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="crm-filter-label">
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </label>
  );
}

export function FilterSearch({
  id,
  label = "Search",
  value,
  onChange,
  placeholder = "Search...",
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  return (
    <div className="crm-filter-field">
      <FilterLabel htmlFor={fieldId} icon={Search}>{label}</FilterLabel>
      <div className="relative">
        <Search className="crm-filter-search-icon" aria-hidden="true" />
        <input
          id={fieldId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="crm-filter-control crm-filter-search"
        />
      </div>
    </div>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  icon,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  icon?: LucideIcon;
}) {
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  return (
    <div className="crm-filter-field">
      <FilterLabel htmlFor={fieldId} icon={icon}>{label}</FilterLabel>
      <select
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="crm-filter-control"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterDate({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  return (
    <div className="crm-filter-field">
      <FilterLabel htmlFor={fieldId} icon={CalendarDays}>{label}</FilterLabel>
      <input
        id={fieldId}
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="crm-filter-control"
      />
    </div>
  );
}
