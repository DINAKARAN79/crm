export interface QuoteUnitFacetSource {
  type?: string | null;
  floor?: number | null;
  block?: string | null;
  status?: string | null;
  area?: number | null;
}

export interface QuoteUnitClassification {
  propertyType: string;
  configuration: string | null;
}

export interface QuotePropertyTypeFacet {
  type: string;
  total: number;
  available: number;
}

export interface QuoteFloorFacet {
  propertyType: string;
  tower: string | null;
  floor: number;
  label: string;
  total: number;
  available: number;
}

export interface QuoteConfigurationFacet {
  propertyType: string;
  config: string;
  total: number;
  available: number;
}

export interface QuoteTowerFacet {
  propertyType: string;
  tower: string;
  total: number;
  available: number;
}

export interface QuoteUnitFacets {
  propertyTypes: QuotePropertyTypeFacet[];
  floors: QuoteFloorFacet[];
  configurations: QuoteConfigurationFacet[];
  towers: QuoteTowerFacet[];
}

export interface QuoteDrillSelection {
  propertyType: string;
  tower: string;
  floor: number | null;
  config: string;
}

export type QuoteDrillStep = 'empty' | 'type' | 'tower' | 'floor' | 'config' | 'units';

const PROPERTY_ORDER = ['Apartment', 'Villa', 'Plot'];

export function formatQuoteFloor(floor: number): string {
  if (floor === 0) return 'Ground';
  const mod100 = Math.abs(floor) % 100;
  const mod10 = Math.abs(floor) % 10;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : mod10 === 1
      ? 'st'
      : mod10 === 2
        ? 'nd'
        : mod10 === 3
          ? 'rd'
          : 'th';
  return `${floor}${suffix} Floor`;
}

export function classifyQuoteUnit(type?: string | null): QuoteUnitClassification {
  const raw = (type || '').trim();
  const value = raw.toLowerCase();
  const bedrooms = raw.match(/(\d+)\s*bhk/i);
  const configuration = bedrooms ? `${bedrooms[1]} BHK` : null;
  if (!raw) return { propertyType: 'Other', configuration: null };
  if (value === 'plot' || value === 'land' || value.includes('plot')) {
    return { propertyType: 'Plot', configuration: null };
  }
  if (value === 'villa' || value.includes('villa')) {
    return { propertyType: 'Villa', configuration };
  }
  if (
    value === 'apartment'
    || value.includes('apartment')
    || value.includes('flat')
    || value.includes('penthouse')
    || bedrooms
  ) {
    return {
      propertyType: 'Apartment',
      configuration: configuration || (value.includes('penthouse') ? 'Penthouse' : null),
    };
  }
  return { propertyType: raw, configuration };
}

function isAvailable(status?: string | null) {
  return (status || '').toUpperCase() === 'AVAILABLE';
}

function comparePropertyType(left: string, right: string) {
  const leftIndex = PROPERTY_ORDER.indexOf(left);
  const rightIndex = PROPERTY_ORDER.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? PROPERTY_ORDER.length : leftIndex) - (rightIndex === -1 ? PROPERTY_ORDER.length : rightIndex);
  }
  return left.localeCompare(right);
}

function compareConfiguration(left: string, right: string) {
  const leftNumber = Number(left.match(/^(\d+)/)?.[1] || 0);
  const rightNumber = Number(right.match(/^(\d+)/)?.[1] || 0);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

export function buildQuoteUnitFacets(units: QuoteUnitFacetSource[]): QuoteUnitFacets {
  const propertyTypes = new Map<string, QuotePropertyTypeFacet>();
  const floors = new Map<string, QuoteFloorFacet>();
  const configurations = new Map<string, QuoteConfigurationFacet>();
  const towers = new Map<string, QuoteTowerFacet>();

  for (const unit of units) {
    const classified = classifyQuoteUnit(unit.type);
    const available = isAvailable(unit.status);
    const property = propertyTypes.get(classified.propertyType) || {
      type: classified.propertyType,
      total: 0,
      available: 0,
    };
    property.total += 1;
    if (available) property.available += 1;
    propertyTypes.set(classified.propertyType, property);

    const tower = (unit.block || '').trim();
    if (tower) {
      const towerKey = `${classified.propertyType}\0${tower}`;
      const towerFacet = towers.get(towerKey) || {
        propertyType: classified.propertyType,
        tower,
        total: 0,
        available: 0,
      };
      towerFacet.total += 1;
      if (available) towerFacet.available += 1;
      towers.set(towerKey, towerFacet);
    }

    if (classified.propertyType === 'Apartment' && unit.floor != null && Number.isInteger(unit.floor)) {
      const floorKey = `${classified.propertyType}\0${tower}\0${unit.floor}`;
      const floorFacet = floors.get(floorKey) || {
        propertyType: classified.propertyType,
        tower: tower || null,
        floor: unit.floor,
        label: formatQuoteFloor(unit.floor),
        total: 0,
        available: 0,
      };
      floorFacet.total += 1;
      if (available) floorFacet.available += 1;
      floors.set(floorKey, floorFacet);
    }

    if (classified.propertyType === 'Villa' && classified.configuration) {
      const configKey = `${classified.propertyType}\0${classified.configuration}`;
      const configFacet = configurations.get(configKey) || {
        propertyType: classified.propertyType,
        config: classified.configuration,
        total: 0,
        available: 0,
      };
      configFacet.total += 1;
      if (available) configFacet.available += 1;
      configurations.set(configKey, configFacet);
    }
  }

  return {
    propertyTypes: [...propertyTypes.values()].sort((left, right) => comparePropertyType(left.type, right.type)),
    floors: [...floors.values()].sort((left, right) => left.floor - right.floor || (left.tower || '').localeCompare(right.tower || '')),
    configurations: [...configurations.values()].sort((left, right) => compareConfiguration(left.config, right.config)),
    towers: [...towers.values()].sort((left, right) => left.tower.localeCompare(right.tower)),
  };
}

export function quoteUnitMatches(
  unit: QuoteUnitFacetSource,
  selection: QuoteDrillSelection,
): boolean {
  if (!selection.propertyType) return false;
  const classified = classifyQuoteUnit(unit.type);
  if (classified.propertyType !== selection.propertyType) return false;
  if (selection.tower && (unit.block || '').trim() !== selection.tower) return false;
  if (selection.floor != null && unit.floor !== selection.floor) return false;
  if (selection.config && classified.configuration !== selection.config) return false;
  return true;
}

export function quoteDrillStep(facets: QuoteUnitFacets, selection: QuoteDrillSelection): QuoteDrillStep {
  if (facets.propertyTypes.length === 0) return 'empty';
  if (!selection.propertyType) return 'type';
  const towers = facets.towers.filter((item) => item.propertyType === selection.propertyType);
  const floors = facets.floors.filter((item) =>
    item.propertyType === selection.propertyType && (towers.length < 2 || item.tower === selection.tower));
  const configurations = facets.configurations.filter((item) => item.propertyType === selection.propertyType);
  if (selection.propertyType === 'Apartment' || (selection.propertyType !== 'Villa' && selection.propertyType !== 'Plot' && floors.length > 0)) {
    if (towers.length > 1 && !selection.tower) return 'tower';
    if (floors.length > 0 && selection.floor == null) return 'floor';
    return 'units';
  }
  if (selection.propertyType === 'Villa' && configurations.length > 1 && !selection.config) return 'config';
  return 'units';
}
