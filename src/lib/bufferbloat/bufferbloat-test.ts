export type BufferbloatGrade = 'clean' | 'watch' | 'loaded-latency-high' | 'insufficient-data';

export interface BufferbloatGradeInput {
  readonly idleMedianMs: number | null;
  readonly loadedMedianMs: number | null;
}

export interface BufferbloatGradeResult {
  readonly grade: BufferbloatGrade;
  readonly deltaMs: number | null;
  readonly summary: string;
}

export function median(values: readonly number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return Math.round(finite[middle] ?? 0);
  const left = finite[middle - 1] ?? 0;
  const right = finite[middle] ?? left;
  return Math.round((left + right) / 2);
}

export function gradeBufferbloat(input: BufferbloatGradeInput): BufferbloatGradeResult {
  if (input.idleMedianMs === null || input.loadedMedianMs === null) {
    return {
      grade: 'insufficient-data',
      deltaMs: null,
      summary: 'Run idle and loaded checks before grading loaded latency.',
    };
  }

  const deltaMs = Math.max(0, Math.round(input.loadedMedianMs - input.idleMedianMs));
  const summary = `Latency rose by ${deltaMs} ms during download load.`;

  if (deltaMs >= 100) {
    return { grade: 'loaded-latency-high', deltaMs, summary };
  }

  if (deltaMs >= 40) {
    return { grade: 'watch', deltaMs, summary };
  }

  return { grade: 'clean', deltaMs, summary };
}
