export interface TopologyContextInput {
  readonly hostname: string;
  readonly asn: number | null;
  readonly organization: string | null;
}

export function describeTopologyContext(input: TopologyContextInput): string {
  if (input.asn === null) {
    return `No ASN context was found for ${input.hostname}. This does not prove reachability or route health.`;
  }

  const organization = input.organization ? ` (${input.organization})` : '';
  return `${input.hostname} maps to AS${input.asn}${organization}. This is topology context, not active path proof.`;
}
