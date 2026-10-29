import { describe, expect, it } from 'vitest';
import {
  apartmentFloorsForBlock,
  resolveUnitLocation,
  unitUsesBlockAndFloor,
} from '@dct-crm/shared';

describe('unit property location', () => {
  it('requires a block and a floor that belongs to that block for apartments', () => {
    expect(resolveUnitLocation({ type: 'Apartment' })).toEqual({ ok: false, error: 'Block is required.' });
    expect(resolveUnitLocation({ type: 'Apartment', block: 'Block 1' })).toEqual({
      ok: false,
      error: 'Floor is required for this block.',
    });
    expect(resolveUnitLocation({ type: 'Apartment', block: 'Block 1', floor: 9 })).toEqual({
      ok: false,
      error: 'Floor is required for this block.',
    });
    expect(resolveUnitLocation({ type: 'Apartment', block: 'Block 2', floor: 3 })).toEqual({
      ok: true,
      type: 'Apartment',
      block: 'Block 2',
      floor: 3,
    });
    expect(apartmentFloorsForBlock('Block 1')).toEqual([1, 2, 3]);
    expect(apartmentFloorsForBlock('Block 9')).toEqual([]);
  });

  it('keeps plot and villa units free of block and floor unless the project asks for them', () => {
    expect(unitUsesBlockAndFloor('Plot', 'Residential')).toBe(false);
    expect(unitUsesBlockAndFloor('Villa', 'Residential')).toBe(false);
    expect(unitUsesBlockAndFloor('Villa', 'Villa block')).toBe(true);
    expect(resolveUnitLocation({ type: 'Plot', block: 'Block 1', floor: 2, projectType: 'Residential' })).toEqual({
      ok: true,
      type: 'Plot',
      block: null,
      floor: null,
    });
    expect(resolveUnitLocation({ type: 'Villa', projectType: 'Residential' })).toEqual({
      ok: true,
      type: 'Villa',
      block: null,
      floor: null,
    });
    expect(resolveUnitLocation({ type: 'Villa', block: 'Block 1', floor: 1, projectType: 'Needs floor plan' })).toEqual({
      ok: true,
      type: 'Villa',
      block: 'Block 1',
      floor: 1,
    });
  });

  it('rejects a type outside Apartment, Plot, and Villa', () => {
    expect(resolveUnitLocation({ type: 'Land' }).ok).toBe(false);
  });
});
