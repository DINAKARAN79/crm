import { describe, expect, it } from 'vitest';
import { inviteUserSchema } from './users';

describe('inviteUserSchema', () => {
  it('accepts a single-name user without a last name or role assignment', () => {
    const result = inviteUserSchema.parse({
      email: 'sam@example.com',
      firstName: 'Sam',
      lastName: '',
      phone: '',
      profileId: 'profile_123',
      roleIds: [],
    });

    expect(result.firstName).toBe('Sam');
    expect(result.lastName).toBe('');
    expect(result.roleIds).toEqual([]);
    expect(result.phone).toBeUndefined();
  });
});
