import type {
  DiagnosticClaim,
  DiagnosticClaimKind,
  DiagnosticConfidence,
  DiagnosticEvidenceGate,
} from './diagnostic-narrative';

export type ClaimId =
  | 'browser-measured-comparison'
  | 'browser-visibility-limited'
  | 'remote-vantage-measured'
  | 'local-path-needs-proof'
  | 'run-outside-check-next'
  | 'run-local-agent-next';

export interface ClaimEvidenceState {
  readonly sampleReady: boolean;
  readonly sampleActionable: boolean;
  readonly sampleMature: boolean;
  readonly allEnabledReady: boolean;
  readonly totalTiming: boolean;
  readonly phaseTiming: boolean;
  readonly remoteVantage: boolean;
  readonly baselineReady: boolean;
  readonly localAgent: boolean;
}

interface ClaimTemplate {
  readonly kind: DiagnosticClaimKind;
  readonly strength: DiagnosticConfidence;
  readonly requiredEvidence: readonly DiagnosticEvidenceGate[];
  readonly text: (vars: Record<string, string>) => string;
}

const templates: Record<ClaimId, ClaimTemplate> = {
  'browser-measured-comparison': {
    kind: 'measured',
    strength: 'medium',
    requiredEvidence: ['sample-ready', 'all-enabled-ready', 'total-timing'],
    text: (vars) => `Chronoscope measured ${vars.endpointLabel ?? 'this endpoint'} against the other enabled sites in this browser run.`,
  },
  'browser-visibility-limited': {
    kind: 'limited',
    strength: 'low',
    requiredEvidence: ['total-timing'],
    text: () => 'The browser can compare total load time, but some lower-level timing details are hidden.',
  },
  'remote-vantage-measured': {
    kind: 'measured',
    strength: 'medium',
    requiredEvidence: ['remote-vantage'],
    text: (vars) => `Cloudflare also measured ${vars.endpointLabel ?? 'this endpoint'} from outside this browser path.`,
  },
  'local-path-needs-proof': {
    kind: 'inferred',
    strength: 'low',
    requiredEvidence: ['sample-actionable', 'remote-vantage'],
    text: (vars) => `${vars.endpointLabel ?? 'This endpoint'} needs a local-agent or second-network check before naming the local path.`,
  },
  'run-outside-check-next': {
    kind: 'next-validation',
    strength: 'low',
    requiredEvidence: [],
    text: (vars) => `Run an outside check for ${vars.endpointLabel ?? 'this endpoint'} to compare your browser path with a Cloudflare edge.`,
  },
  'run-local-agent-next': {
    kind: 'next-validation',
    strength: 'low',
    requiredEvidence: [],
    text: (vars) => `Run the local agent for ${vars.endpointLabel ?? 'this endpoint'} to capture DNS, TLS, route, and WiFi evidence from this device.`,
  },
};

const gateToState: Record<DiagnosticEvidenceGate, keyof ClaimEvidenceState> = {
  'sample-ready': 'sampleReady',
  'sample-actionable': 'sampleActionable',
  'sample-mature': 'sampleMature',
  'all-enabled-ready': 'allEnabledReady',
  'total-timing': 'totalTiming',
  'phase-timing': 'phaseTiming',
  'remote-vantage': 'remoteVantage',
  'baseline-ready': 'baselineReady',
  'local-agent': 'localAgent',
};

export function canRenderClaim(id: ClaimId, evidence: ClaimEvidenceState): boolean {
  return templates[id].requiredEvidence.every((gate) => evidence[gateToState[gate]]);
}

export function renderClaim(
  id: ClaimId,
  evidence: ClaimEvidenceState,
  vars: Record<string, string> = {},
): DiagnosticClaim | null {
  const template = templates[id];
  if (!canRenderClaim(id, evidence)) return null;
  return {
    id,
    kind: template.kind,
    strength: template.strength,
    text: template.text(vars),
    evidenceIds: template.requiredEvidence,
    requiredEvidence: template.requiredEvidence,
  };
}
