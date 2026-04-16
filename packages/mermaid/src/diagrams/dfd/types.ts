export type StrideCategory = 'S' | 'T' | 'R' | 'I' | 'D' | 'E';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ThreatStatus = 'new' | 'investigate' | 'not-applicable' | 'mitigated';
export type DfdDirection = 'LR' | 'RL' | 'TB' | 'BT';
export type DfdElementType = 'external' | 'process' | 'datastore';

export interface DfdElement {
  id: string;
  label: string;
  type: DfdElementType;
  boundaryId?: string;
}

export interface DfdDataFlow {
  id?: string;
  index: number;
  source: string;
  target: string;
  label: string;
  description?: string;
  numberLabel?: string;
}

export interface DfdTrustBoundary {
  id: string;
  label: string;
  elementIds: string[];
  childBoundaryIds: string[];
  parentBoundaryId?: string;
}

export interface DfdThreat {
  number: number;
  targetId: string;
  category: StrideCategory;
  description: string;
  severity?: SeverityLevel;
  status: ThreatStatus;
}

/**
 * STRIDE-per-element applicability mapping.
 * Used for validation warnings only — not rendered in diagram.
 */
export const STRIDE_APPLICABILITY: Record<DfdElementType | 'dataflow', StrideCategory[]> = {
  external: ['S', 'R'],
  process: ['S', 'T', 'R', 'I', 'D', 'E'],
  datastore: ['T', 'R', 'I', 'D'],
  dataflow: ['T', 'I', 'D'],
};

/**
 * STRIDE category display colors for threat badges.
 */
export const STRIDE_COLORS: Record<StrideCategory, string> = {
  S: '#e74c3c', // Red - Spoofing
  T: '#e67e22', // Orange - Tampering
  R: '#f1c40f', // Yellow - Repudiation
  I: '#9b59b6', // Purple - Information Disclosure
  D: '#3498db', // Blue - Denial of Service
  E: '#2c3e50', // Dark - Elevation of Privilege
};

/**
 * Full names for STRIDE categories.
 */
export const STRIDE_NAMES: Record<StrideCategory, string> = {
  S: 'Spoofing',
  T: 'Tampering',
  R: 'Repudiation',
  I: 'Information Disclosure',
  D: 'Denial of Service',
  E: 'Elevation of Privilege',
};

/**
 * Emoji icons for STRIDE categories.
 */
export const STRIDE_EMOJIS: Record<StrideCategory, string> = {
  S: '🎭',
  T: '🔧',
  R: '🙈',
  I: '🔓',
  D: '🚫',
  E: '⬆️',
};
