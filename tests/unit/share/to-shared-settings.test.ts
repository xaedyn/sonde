import { describe, it, expect } from 'vitest';
import { toSharedSettings } from '../../../src/lib/share/share-manager';
import type { Settings } from '../../../src/lib/types';
import { MAX_CAP } from '../../../src/lib/limits';

describe('toSharedSettings', () => {
  it('strips region from the output', () => {
    const settings: Settings = {
      timeout: 5000,
      delay: 0,
      burstRounds: 50,
      monitorDelay: 1000,
      cap: MAX_CAP,
      corsMode: 'no-cors',
      region: 'europe',
    };
    const shared = toSharedSettings(settings);
    expect('region' in shared).toBe(false);
  });

  it('preserves all 6 share fields', () => {
    const settings: Settings = {
      timeout: 3000,
      delay: 100,
      burstRounds: 25,
      monitorDelay: 500,
      cap: 100,
      corsMode: 'cors',
      region: 'east-asia',
    };
    const shared = toSharedSettings(settings);
    expect(shared.timeout).toBe(3000);
    expect(shared.delay).toBe(100);
    expect(shared.burstRounds).toBe(25);
    expect(shared.monitorDelay).toBe(500);
    expect(shared.cap).toBe(100);
    expect(shared.corsMode).toBe('cors');
  });

  it('output is assignable to SharePayload[settings] shape', () => {
    const settings: Settings = {
      timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors',
    };
    const shared = toSharedSettings(settings);
    expect(shared).toHaveProperty('timeout');
    expect(shared).toHaveProperty('delay');
    expect(shared).toHaveProperty('cap');
    expect(shared).toHaveProperty('corsMode');
  });

  it('works when region is undefined (no region field in source)', () => {
    const settings: Settings = {
      timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors',
    };
    const shared = toSharedSettings(settings);
    expect('region' in shared).toBe(false);
  });
});
