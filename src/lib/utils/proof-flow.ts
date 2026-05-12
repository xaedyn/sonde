import type { CompanionProbeResponse } from '../companion/protocol';
import type { RemoteVantageProbeResponse } from '../remote-vantage/types';
import type { CompanionStatus } from '../stores/companion';
import type { RemoteVantageStatus } from '../stores/remote-vantage';
import type { EvidenceTrailTone } from './evidence-trail';

export type ProofKind = 'remote' | 'local';

export interface ProofSummary {
  readonly status: string;
  readonly text: string;
  readonly tone: EvidenceTrailTone;
  readonly detail?: string;
}

export interface ProofActionState {
  readonly label: string;
  readonly tone: EvidenceTrailTone;
  readonly disabled: boolean;
}

export function isProofStale(input: {
  readonly reportCreatedAt: number | null;
  readonly proofGeneratedAt: number | null;
}): boolean {
  return input.reportCreatedAt !== null &&
    input.proofGeneratedAt !== null &&
    input.proofGeneratedAt < input.reportCreatedAt;
}

export function proofFreshnessLabel(input: {
  readonly reportCreatedAt: number | null;
  readonly proofGeneratedAt: number | null;
}): string {
  if (input.proofGeneratedAt === null) return 'Not run';
  return isProofStale(input) ? 'Stale' : 'Fresh';
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function countPhrase(count: number, total: number, singular: string): string {
  return total === 1
    ? `${count}/${total} ${singular}`
    : `${count} of ${total} ${plural(total, singular)}`;
}

export function summarizeRemoteProof(probe: RemoteVantageProbeResponse | null): ProofSummary {
  if (!probe) {
    return {
      status: 'Not run',
      text: 'No Cloudflare outside check captured.',
      tone: 'neutral',
    };
  }

  const problemCount = probe.results.filter((result) => (
    result.verdict === 'slow' ||
    result.verdict === 'http-error' ||
    result.verdict === 'unreachable'
  )).length;
  const endpointLabel = plural(probe.results.length, 'endpoint');

  if (problemCount > 0) {
    const verb = problemCount === 1 ? 'was' : 'were';
    return {
      status: 'Captured',
      text: `${countPhrase(problemCount, probe.results.length, 'endpoint')} ${verb} slow or failed from Cloudflare`,
      tone: 'bad',
    };
  }

  return {
    status: 'Captured',
    text: `Cloudflare reached ${probe.results.length} ${endpointLabel} without slow or failed results`,
    tone: 'good',
  };
}

export function summarizeLocalProof(probe: CompanionProbeResponse | null): ProofSummary {
  if (!probe) {
    return {
      status: 'Not run',
      text: 'No local agent probe captured.',
      tone: 'neutral',
    };
  }

  return {
    status: 'Captured',
    text: `${probe.targetHost}: ${probe.summary}`,
    tone: probe.ok ? 'good' : 'watch',
  };
}

export function buildProofActionState(input: {
  readonly kind: ProofKind;
  readonly status: RemoteVantageStatus | CompanionStatus;
  readonly hasProof: boolean;
  readonly hasError: boolean;
  readonly hasSecret?: boolean;
  readonly isStale?: boolean;
}): ProofActionState {
  if (input.status === 'checking' || input.status === 'probing') {
    return { label: 'Running', tone: 'watch', disabled: true };
  }
  if (input.hasProof && input.isStale) {
    return { label: 'Stale', tone: 'watch', disabled: false };
  }
  if (input.hasProof) return { label: 'Captured', tone: 'good', disabled: false };
  if (input.hasError) {
    return {
      label: input.kind === 'local'
        ? (input.hasSecret ? 'Needs check' : 'Needs setup')
        : 'Failed',
      tone: 'watch',
      disabled: false,
    };
  }
  return { label: 'Not run', tone: 'neutral', disabled: false };
}
