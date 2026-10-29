import type { ReactNode } from "react";
import { Building2, Home, LandPlot, Layers3 } from "lucide-react";
import type { QuoteConfigurationFacet, QuoteFloorFacet, QuotePropertyTypeFacet, QuoteTowerFacet } from "@dct-crm/shared";

function Chip({
  label,
  detail,
  selected,
  icon,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  icon?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
      <span className={selected ? "text-indigo-100" : "text-slate-500"}>{detail}</span>
    </button>
  );
}

function countLabel(available: number) {
  return `${available} available`;
}

const typeIcon: Record<string, ReactNode> = {
  Apartment: <Building2 className="h-4 w-4" aria-hidden="true" />,
  Villa: <Home className="h-4 w-4" aria-hidden="true" />,
  Plot: <LandPlot className="h-4 w-4" aria-hidden="true" />,
};

export function PropertyTypePicker({
  options,
  value,
  onChange,
}: {
  options: QuotePropertyTypeFacet[];
  value: string;
  onChange: (type: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Property type" className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <Chip
          key={option.type}
          label={option.type}
          detail={`${option.total} · ${countLabel(option.available)}`}
          selected={value === option.type}
          icon={typeIcon[option.type] || <Layers3 className="h-4 w-4" aria-hidden="true" />}
          onSelect={() => onChange(option.type)}
        />
      ))}
    </div>
  );
}

export function TowerPicker({
  options,
  value,
  onChange,
}: {
  options: QuoteTowerFacet[];
  value: string;
  onChange: (tower: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Tower or block" className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <Chip
          key={option.tower}
          label={option.tower}
          detail={countLabel(option.available)}
          selected={value === option.tower}
          onSelect={() => onChange(option.tower)}
        />
      ))}
    </div>
  );
}

export function FloorPicker({
  options,
  value,
  onChange,
}: {
  options: QuoteFloorFacet[];
  value: number | null;
  onChange: (floor: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Floor" className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <Chip
          key={`${option.tower || ""}-${option.floor}`}
          label={option.label}
          detail={countLabel(option.available)}
          selected={value === option.floor}
          onSelect={() => onChange(option.floor)}
        />
      ))}
    </div>
  );
}

export function ConfigurationPicker({
  options,
  value,
  onChange,
}: {
  options: QuoteConfigurationFacet[];
  value: string;
  onChange: (config: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Villa configuration" className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <Chip
          key={option.config}
          label={option.config}
          detail={countLabel(option.available)}
          selected={value === option.config}
          onSelect={() => onChange(option.config)}
        />
      ))}
    </div>
  );
}

export function UnitSummaryBar({
  crumbs,
  summary,
  onCrumb,
}: {
  crumbs: Array<{ label: string; onSelect?: () => void }>;
  summary: string;
  onCrumb: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Unit selection" className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <span className="text-slate-400" aria-hidden="true">&gt;</span>}
            {crumb.onSelect ? (
              <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => onCrumb(index)}>
                {crumb.label}
              </button>
            ) : (
              <span className="font-medium text-slate-800">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      {summary ? <p className="text-xs text-slate-600">{summary}</p> : null}
    </div>
  );
}

export function QuoteDrillSkeleton() {
  return (
    <div role="status" aria-label="Loading unit choices" className="space-y-3">
      <div className="flex gap-2">
        <div className="h-11 w-36 animate-pulse rounded-full bg-slate-200" />
        <div className="h-11 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="h-11 w-28 animate-pulse rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
