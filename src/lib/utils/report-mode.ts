import type { ReportKind } from '../types';

export interface ReportModeCopyInput {
  readonly reportKind: ReportKind;
  readonly primaryAnswer: string;
  readonly confidenceLabel: string;
  readonly sampleCount: number;
  readonly endpointCount: number;
  readonly timingHeadline: string;
}

export interface ReportModeCopy {
  readonly kicker: string;
  readonly lede: string;
  readonly primaryActionLabel: string;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function sentenceStart(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function reportModeCopy(input: ReportModeCopyInput): ReportModeCopy {
  const evidence = `${countLabel(input.sampleCount, 'sample')} across ${countLabel(input.endpointCount, 'endpoint')}`;
  if (input.reportKind === 'snapshot') {
    return {
      kicker: 'Performance snapshot',
      lede: `Shareable performance snapshot: ${evidence}. ${input.timingHeadline}.`,
      primaryActionLabel: 'Copy Snapshot Summary',
    };
  }

  return {
    kicker: 'Support report',
    lede: `Evidence package: ${evidence}. ${sentenceStart(input.confidenceLabel)}. ${input.timingHeadline}.`,
    primaryActionLabel: 'Copy Support Summary',
  };
}
