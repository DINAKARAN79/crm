import { describe, expect, it } from 'vitest';
import {
  buildQuoteUnitFacets,
  classifyQuoteUnit,
  formatQuoteFloor,
  quoteDrillStep,
  quoteUnitMatches,
} from '@dct-crm/shared';

describe('quote unit drill-down', () => {
  it('classifies stored unit types without a separate property-type column', () => {
    expect(classifyQuoteUnit('2BHK')).toEqual({ propertyType: 'Apartment', configuration: '2 BHK' });
    expect(classifyQuoteUnit('Penthouse')).toEqual({ propertyType: 'Apartment', configuration: 'Penthouse' });
    expect(classifyQuoteUnit('Villa')).toEqual({ propertyType: 'Villa', configuration: null });
    expect(classifyQuoteUnit('3 BHK Villa')).toEqual({ propertyType: 'Villa', configuration: '3 BHK' });
    expect(classifyQuoteUnit('Plot')).toEqual({ propertyType: 'Plot', configuration: null });
  });

  it('labels floors with ordinals and treats zero as ground', () => {
    expect(formatQuoteFloor(0)).toBe('Ground');
    expect(formatQuoteFloor(1)).toBe('1st Floor');
    expect(formatQuoteFloor(2)).toBe('2nd Floor');
    expect(formatQuoteFloor(3)).toBe('3rd Floor');
    expect(formatQuoteFloor(11)).toBe('11th Floor');
  });

  it('builds apartment floors and villa configurations from the same unit list', () => {
    const facets = buildQuoteUnitFacets([
      { type: '1BHK', floor: 2, status: 'AVAILABLE' },
      { type: '2BHK', floor: 2, status: 'RESERVED' },
      { type: 'Villa', floor: 2, status: 'AVAILABLE' },
      { type: '3 BHK Villa', floor: null, status: 'AVAILABLE' },
      { type: 'Plot', floor: null, status: 'AVAILABLE' },
    ]);
    expect(facets.propertyTypes.map((item) => item.type)).toEqual(['Apartment', 'Villa', 'Plot']);
    expect(facets.floors).toEqual([
      expect.objectContaining({ propertyType: 'Apartment', floor: 2, total: 2, available: 1, label: '2nd Floor' }),
    ]);
    expect(facets.configurations.map((item) => item.config)).toEqual(['3 BHK']);
  });

  it('asks for a floor only after an apartment type, and a configuration only when villas differ', () => {
    const facets = buildQuoteUnitFacets([
      { type: '1BHK', floor: 1, status: 'AVAILABLE' },
      { type: '2BHK', floor: 2, status: 'AVAILABLE' },
      { type: 'Villa', status: 'AVAILABLE' },
      { type: '2 BHK Villa', status: 'BOOKED' },
    ]);
    expect(quoteDrillStep(facets, { propertyType: '', tower: '', floor: null, config: '' })).toBe('type');
    expect(quoteDrillStep(facets, { propertyType: 'Apartment', tower: '', floor: null, config: '' })).toBe('floor');
    expect(quoteDrillStep(facets, { propertyType: 'Apartment', tower: '', floor: 2, config: '' })).toBe('units');
    expect(quoteDrillStep(facets, { propertyType: 'Villa', tower: '', floor: null, config: '' })).toBe('units');
    const twoConfigs = buildQuoteUnitFacets([
      { type: '2 BHK Villa', status: 'AVAILABLE' },
      { type: '3 BHK Villa', status: 'AVAILABLE' },
    ]);
    expect(quoteDrillStep(twoConfigs, { propertyType: 'Villa', tower: '', floor: null, config: '' })).toBe('config');
    expect(quoteDrillStep(twoConfigs, { propertyType: 'Villa', tower: '', floor: null, config: '2 BHK' })).toBe('units');
    expect(quoteUnitMatches(
      { type: '2BHK', floor: 2, status: 'AVAILABLE' },
      { propertyType: 'Apartment', tower: '', floor: 2, config: '' },
    )).toBe(true);
    expect(quoteUnitMatches(
      { type: 'Villa', floor: 2, status: 'AVAILABLE' },
      { propertyType: 'Apartment', tower: '', floor: 2, config: '' },
    )).toBe(false);
  });
});
