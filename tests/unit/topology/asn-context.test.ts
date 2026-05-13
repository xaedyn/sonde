import { describe, expect, it } from 'vitest';

import { describeTopologyContext } from '../../../src/lib/topology/asn-context';

describe('describeTopologyContext', () => {
  it('labels ASN data as topology context, not active path proof', () => {
    const text = describeTopologyContext({
      hostname: 'api.example.com',
      asn: 64500,
      organization: 'Example Network',
    });

    expect(text).toBe('api.example.com maps to AS64500 (Example Network). This is topology context, not active path proof.');
    expect(text).toContain('topology context');
    expect(text).not.toMatch(/route is healthy|reachable from you|local path/i);
  });

  it('keeps missing ASN context from sounding diagnostic', () => {
    expect(describeTopologyContext({
      hostname: 'missing.example.com',
      asn: null,
      organization: null,
    })).toBe('No ASN context was found for missing.example.com. This does not prove reachability or route health.');
  });
});
