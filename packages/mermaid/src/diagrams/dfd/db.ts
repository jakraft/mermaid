import { log } from '../../logger.js';
import {
  setAccTitle,
  getAccTitle,
  setDiagramTitle,
  getDiagramTitle,
  getAccDescription,
  setAccDescription,
  clear as commonClear,
} from '../common/commonDb.js';
import type {
  DfdElement,
  DfdDataFlow,
  DfdTrustBoundary,
  DfdThreat,
  DfdDirection,
  StrideCategory,
  SeverityLevel,
  ThreatStatus,
  DfdElementType,
} from './types.js';
import { STRIDE_APPLICABILITY } from './types.js';

// State
let elements = new Map<string, DfdElement>();
let flows: DfdDataFlow[] = [];
let boundaries = new Map<string, DfdTrustBoundary>();
let threats: DfdThreat[] = [];
let direction: DfdDirection = 'TB';
let showThreats = false;
let autonumber = false;
let threatCounter = 0;
let flowCounter = 0;

const clear = (): void => {
  elements = new Map();
  flows = [];
  boundaries = new Map();
  threats = [];
  direction = 'TB';
  showThreats = false;
  autonumber = false;
  threatCounter = 0;
  flowCounter = 0;
  commonClear();
};

const addElement = (id: string, label: string, type: DfdElementType, boundaryId?: string): void => {
  if (elements.has(id)) {
    throw new Error(`Duplicate element ID: "${id}"`);
  }
  elements.set(id, { id, label, type, boundaryId });
  if (boundaryId && boundaries.has(boundaryId)) {
    boundaries.get(boundaryId)!.elementIds.push(id);
  }
  log.debug(`Added ${type}: ${id} "${label}"${boundaryId ? ` in boundary ${boundaryId}` : ''}`);
};

const addFlow = (
  source: string,
  target: string,
  label: string,
  flowId?: string,
  description?: string,
  numberLabel?: string
): void => {
  const index = flowCounter++;
  const flow: DfdDataFlow = {
    id: flowId ?? undefined,
    index,
    source,
    target,
    label,
    description,
    numberLabel,
  };
  flows.push(flow);
  log.debug(
    `Added flow: ${source} -> ${target} "${label}"${numberLabel ? ` [${numberLabel}]` : ''}`
  );
};

const addBoundary = (id: string, label: string, parentBoundaryId?: string): void => {
  if (boundaries.has(id)) {
    throw new Error(`Duplicate boundary ID: "${id}"`);
  }
  boundaries.set(id, {
    id,
    label,
    elementIds: [],
    childBoundaryIds: [],
    parentBoundaryId,
  });
  if (parentBoundaryId && boundaries.has(parentBoundaryId)) {
    boundaries.get(parentBoundaryId)!.childBoundaryIds.push(id);
  }
  log.debug(`Added boundary: ${id} "${label}"${parentBoundaryId ? ` in ${parentBoundaryId}` : ''}`);
};

const addThreat = (
  targetId: string,
  category: StrideCategory,
  description: string,
  severity?: SeverityLevel,
  status?: ThreatStatus
): void => {
  const number = ++threatCounter;
  const threat: DfdThreat = {
    number,
    targetId,
    category,
    description,
    severity: severity ?? undefined,
    status: status ?? 'new',
  };
  threats.push(threat);

  // Validation warning for STRIDE applicability
  const element = elements.get(targetId);
  if (element) {
    const applicable = STRIDE_APPLICABILITY[element.type];
    if (!applicable.includes(category)) {
      log.warn(
        `Threat #${number}: category "${category}" is not typically applicable to ${element.type} "${targetId}"`
      );
    }
  } else {
    // Check if it's a flow
    const flow = flows.find((f) => f.id === targetId);
    if (flow) {
      const applicable = STRIDE_APPLICABILITY.dataflow;
      if (!applicable.includes(category)) {
        log.warn(
          `Threat #${number}: category "${category}" is not typically applicable to data flows`
        );
      }
    }
  }

  log.debug(`Added threat #${number}: ${category} on ${targetId}`);
};

const setDirection = (dir: DfdDirection): void => {
  direction = dir;
};

const setShowThreats = (toggle: boolean): void => {
  showThreats = toggle;
};

const setAutonumber = (toggle: boolean): void => {
  autonumber = toggle;
};

// Getters
const getElements = (): Map<string, DfdElement> => elements;
const getFlows = (): DfdDataFlow[] => flows;
const getBoundaries = (): Map<string, DfdTrustBoundary> => boundaries;
const getThreats = (): DfdThreat[] => threats;
const getDirection = (): DfdDirection => direction;
const getShowThreats = (): boolean => showThreats;
const getAutonumber = (): boolean => autonumber;

export interface DfdDB {
  clear: () => void;
  setDiagramTitle: (title: string) => void;
  getDiagramTitle: () => string;
  setAccTitle: (title: string) => void;
  getAccTitle: () => string;
  setAccDescription: (description: string) => void;
  getAccDescription: () => string;

  addElement: (id: string, label: string, type: DfdElementType, boundaryId?: string) => void;
  addFlow: (
    source: string,
    target: string,
    label: string,
    flowId?: string,
    description?: string,
    numberLabel?: string
  ) => void;
  addBoundary: (id: string, label: string, parentBoundaryId?: string) => void;
  addThreat: (
    targetId: string,
    category: StrideCategory,
    description: string,
    severity?: SeverityLevel,
    status?: ThreatStatus
  ) => void;

  setDirection: (dir: DfdDirection) => void;
  setShowThreats: (toggle: boolean) => void;
  setAutonumber: (toggle: boolean) => void;

  getElements: () => Map<string, DfdElement>;
  getFlows: () => DfdDataFlow[];
  getBoundaries: () => Map<string, DfdTrustBoundary>;
  getThreats: () => DfdThreat[];
  getDirection: () => DfdDirection;
  getShowThreats: () => boolean;
  getAutonumber: () => boolean;
}

export const db: DfdDB = {
  clear,
  setDiagramTitle,
  getDiagramTitle,
  setAccTitle,
  getAccTitle,
  setAccDescription,
  getAccDescription,

  addElement,
  addFlow,
  addBoundary,
  addThreat,

  setDirection,
  setShowThreats,
  setAutonumber,

  getElements,
  getFlows,
  getBoundaries,
  getThreats,
  getDirection,
  getShowThreats,
  getAutonumber,
};
