import type { CompanionState } from '../stores/companion';
import type { RemoteVantageState } from '../stores/remote-vantage';
import type { DiagnosticReport } from './diagnostic-report';
import { summarizeLocalProof, summarizeRemoteProof } from './proof-flow';

export type EvidenceTrailTone = 'good' | 'watch' | 'bad' | 'neutral';

export interface EvidenceTrailItem {
  readonly id:
    | 'browser-run'
    | 'current-answer'
    | 'browser-visibility'
    | 'outside-check'
    | 'local-agent';
  readonly source: string;
  readonly fact: string;
  readonly status: string;
  readonly tone: EvidenceTrailTone;
  readonly detail?: string;
}

interface EvidenceTrailInput {
  readonly report: DiagnosticReport;
  readonly remoteVantage: Pick<RemoteVantageState, 'status' | 'lastProbe' | 'error'>;
  readonly companion: Pick<CompanionState, 'status' | 'lastProbe' | 'error' | 'hasSecret'>;
}

const MAX_FACT_LENGTH = 96;

function truncateFact(text: string): string {
  if (text.length <= MAX_FACT_LENGTH) return text;
  return `${text.slice(0, MAX_FACT_LENGTH - 1).trimEnd()}...`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function edgeLabel(edge: { readonly colo?: string; readonly city?: string; readonly country?: string }): string {
  const parts = [edge.colo, edge.city, edge.country].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Cloudflare edge';
}

function statusToneForSeverity(severity: DiagnosticReport['diagnosis']['severity']): EvidenceTrailTone {
  switch (severity) {
    case 'healthy':
      return 'good';
    case 'degraded':
      return 'bad';
    case 'watch':
      return 'watch';
  }
}

function visibilityStatus(level: DiagnosticReport['diagnosis']['timingVisibility']['level']): string {
  switch (level) {
    case 'phase':
      return 'Detailed';
    case 'mixed':
      return 'Partial';
    case 'total-only':
      return 'Total only';
    case 'none':
      return 'Waiting';
  }
}

function visibilityTone(level: DiagnosticReport['diagnosis']['timingVisibility']['level']): EvidenceTrailTone {
  return level === 'phase' ? 'good' : level === 'none' ? 'watch' : 'neutral';
}

function confidenceStatus(confidence: DiagnosticReport['diagnosis']['confidence']): string {
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

function remoteTrail(remoteVantage: EvidenceTrailInput['remoteVantage']): EvidenceTrailItem {
  if (remoteVantage.lastProbe) {
    const summary = summarizeRemoteProof(remoteVantage.lastProbe);
    const hasProblem = summary.tone === 'bad';
    const edge = edgeLabel(remoteVantage.lastProbe.edge);
    return {
      id: 'outside-check',
      source: 'Outside check',
      fact: truncateFact(hasProblem
        ? summary.text.replace('from Cloudflare', `from ${edge}`)
        : summary.text),
      status: summary.status,
      tone: summary.tone,
      detail: `Checked from ${edge}.`,
    };
  }

  if (remoteVantage.status === 'probing' || remoteVantage.status === 'checking') {
    return {
      id: 'outside-check',
      source: 'Outside check',
      fact: 'Cloudflare outside check is running now.',
      status: 'Running',
      tone: 'watch',
    };
  }

  if (remoteVantage.error) {
    return {
      id: 'outside-check',
      source: 'Outside check',
      fact: 'Outside check did not complete.',
      status: 'Failed',
      tone: 'watch',
      detail: truncateFact(remoteVantage.error),
    };
  }

  return {
    id: 'outside-check',
    source: 'Outside check',
    fact: 'No Cloudflare outside check captured.',
    status: 'Not run',
    tone: 'neutral',
  };
}

function companionTrail(companion: EvidenceTrailInput['companion']): EvidenceTrailItem {
  if (companion.lastProbe) {
    const summary = summarizeLocalProof(companion.lastProbe);
    return {
      id: 'local-agent',
      source: 'Local agent',
      fact: truncateFact(summary.text),
      status: summary.status,
      tone: summary.tone,
    };
  }

  if (companion.status === 'probing' || companion.status === 'checking') {
    return {
      id: 'local-agent',
      source: 'Local agent',
      fact: 'Local agent probe is running now.',
      status: 'Running',
      tone: 'watch',
    };
  }

  if (companion.status === 'connected') {
    return {
      id: 'local-agent',
      source: 'Local agent',
      fact: 'Local agent connected; no probe captured in this report.',
      status: 'Ready',
      tone: 'neutral',
    };
  }

  if (companion.error) {
    return {
      id: 'local-agent',
      source: 'Local agent',
      fact: 'Local agent proof is not captured.',
      status: companion.hasSecret ? 'Needs check' : 'Needs setup',
      tone: 'watch',
      detail: truncateFact(companion.error),
    };
  }

  return {
    id: 'local-agent',
    source: 'Local agent',
    fact: 'No local agent probe captured.',
    status: 'Not run',
    tone: 'neutral',
  };
}

export function buildEvidenceTrail(input: EvidenceTrailInput): EvidenceTrailItem[] {
  const { report } = input;
  const enabledRows = report.endpointRows.filter((row) => row.enabled);
  const sampleStatus = report.keptSampleCount > 0 ? 'Measured' : 'Collecting';
  const sampleTone: EvidenceTrailTone = report.keptSampleCount > 0 ? 'good' : 'watch';

  return [
    {
      id: 'browser-run',
      source: 'Browser test',
      fact: truncateFact(`${report.keptSampleCount} ${plural(report.keptSampleCount, 'sample')} kept across ${enabledRows.length} enabled ${plural(enabledRows.length, 'site')}`),
      status: sampleStatus,
      tone: sampleTone,
    },
    {
      id: 'current-answer',
      source: 'Current answer',
      fact: truncateFact(report.diagnosis.primaryAnswer.text),
      status: confidenceStatus(report.diagnosis.confidence),
      tone: statusToneForSeverity(report.diagnosis.severity),
      detail: truncateFact(report.diagnosis.confidenceReason),
    },
    {
      id: 'browser-visibility',
      source: 'Browser visibility',
      fact: truncateFact(report.diagnosis.timingVisibility.headline),
      status: visibilityStatus(report.diagnosis.timingVisibility.level),
      tone: visibilityTone(report.diagnosis.timingVisibility.level),
      detail: truncateFact(report.diagnosis.timingVisibility.detail),
    },
    remoteTrail(input.remoteVantage),
    companionTrail(input.companion),
  ];
}
