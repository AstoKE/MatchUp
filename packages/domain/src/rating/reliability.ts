import { RATING_CONSTANTS } from './constants';

/** Reliability (RATING_SYSTEM §4): "will they show up?" Independent of skill and XP. */
export type ReliabilityKind = 'ATTENDED' | 'LATE_CANCEL' | 'NO_SHOW';

const R = RATING_CONSTANTS.reliability;

export function reliabilityValue(kind: ReliabilityKind): number {
  return kind === 'ATTENDED'
    ? R.attendedValue
    : kind === 'LATE_CANCEL'
      ? R.lateCancelValue
      : R.noShowValue;
}

/** One counted signal: its value `v` and how old it is (days since the event) at the moment of computing. */
export interface ReliabilitySignal {
  value: number;
  ageDays: number;
}

export interface ReliabilityStats {
  /** 0..1 (shown as 0–100 %). */
  score: number;
  /** 0..<1. */
  confidence: number;
  samples: number;
}

/** `score = (A·p0 + Σ w·v) / (A + Σ w)`, `w = 0.5^(age/180)`, `confidence = Σ w / (Σ w + A)` (§4.2). */
export function reliabilityStats(signals: readonly ReliabilitySignal[]): ReliabilityStats {
  let weightSum = 0;
  let weightedValues = 0;
  for (const s of signals) {
    const w = Math.pow(0.5, Math.max(0, s.ageDays) / R.halfLifeDays);
    weightSum += w;
    weightedValues += w * s.value;
  }
  const a = R.priorWeight;
  return {
    score: (a * R.priorValue + weightedValues) / (a + weightSum),
    confidence: weightSum / (weightSum + a),
    samples: signals.length,
  };
}

/** "New player" until enough signals exist (§4.2). */
export function showsReliabilityPercentage(samples: number): boolean {
  return samples >= R.minSignalsToShow;
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';
export function confidenceBand(confidence: number): ConfidenceBand {
  return confidence < R.confidenceLowBelow
    ? 'LOW'
    : confidence > R.confidenceHighAbove
      ? 'HIGH'
      : 'MEDIUM';
}

const HOUR_MS = 3_600_000;

/**
 * Canceled after `starts_at − min(12 h, ½ · (starts_at − approved_at))` (§4.1). Someone approved three hours
 * before a game is not "late" two hours before it just because of the fixed twelve hours.
 */
export function isLateCancel(args: {
  startsAt: Date;
  approvedAt: Date;
  canceledAt: Date;
}): boolean {
  const sinceApproval = args.startsAt.getTime() - args.approvedAt.getTime();
  const window = Math.min(R.lateCancelMaxWindowHours * HOUR_MS, sinceApproval / 2);
  return args.canceledAt.getTime() > args.startsAt.getTime() - window;
}
