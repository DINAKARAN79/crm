import { describe, expect, it } from 'vitest';
import { assertDialpadUrl, DEFAULT_DIALPAD_URL, TelephonyUrlError } from './telephonyUrl';

describe('assertDialpadUrl', () => {
  it('accepts the approved Bizcall origin', () => {
    expect(assertDialpadUrl(DEFAULT_DIALPAD_URL, { env: 'production' })).toBe(DEFAULT_DIALPAD_URL);
  });

  it('rejects other hosts that are not covered by the application CSP', () => {
    expect(() => assertDialpadUrl('https://dialpad.example.com/embed', { env: 'production' }))
      .toThrowError(TelephonyUrlError);
  });

  it('rejects HTTP URLs in production', () => {
    expect(() => assertDialpadUrl('http://bizcall.cxteletech.com/embed', { env: 'production' }))
      .toThrow('The dialpad URL must use HTTPS and a public host.');
  });
});
