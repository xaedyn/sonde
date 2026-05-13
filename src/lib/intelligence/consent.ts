export interface IntelligenceConsentInput {
  readonly optedIn: boolean;
  readonly reportHasResults: boolean;
}

export function canContributeIntelligence(input: IntelligenceConsentInput): boolean {
  return input.optedIn && input.reportHasResults;
}

export function contributionCopy(): string {
  return 'This is optional: contribute anonymous aggregate timing evidence. Chronoscope will not send full URLs, WiFi identifiers, local history, or private network targets.';
}
