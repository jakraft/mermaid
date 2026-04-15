import type { Dfd } from '@mermaid-js/parser';
import { parse } from '@mermaid-js/parser';
import { log } from '../../logger.js';
import type { ParserDefinition } from '../../diagram-api/types.js';
import { populateCommonDb } from '../common/populateCommonDb.js';
import type { DfdDB } from './db.js';
import { db } from './db.js';
import type { StrideCategory, SeverityLevel, ThreatStatus } from './types.js';

/** Strip triple-quote delimiters and common leading whitespace from multi-line text. */
function stripTripleQuotes(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  // Remove """ delimiters
  let text = raw.replace(/^"""/, '').replace(/"""$/, '');
  // Split into lines, drop leading/trailing empty lines
  const lines = text.split('\n');
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  // Find minimum indentation
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => /^(\s*)/.exec(l)?.[1].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  // Strip common indent and join
  text = lines.map((l) => l.slice(minIndent)).join('\n');
  return text.length > 0 ? text : undefined;
}

/** AST DataFlow node type (from Langium-generated types) */
type AstDataFlow = Dfd['flows'][number];

/**
 * Process a list of AST DataFlow nodes recursively, computing hierarchical
 * number labels (e.g. "3", "3.1", "3.2.1") and adding them to the DB.
 *
 * @param flows - AST flow nodes at this nesting level
 * @param db - DFD database
 * @param autonumber - whether autonumber is enabled
 * @param prefix - parent number prefix (e.g. "3.2"), empty string at root
 */
function processFlows(flows: AstDataFlow[], db: DfdDB, autonumber: boolean, prefix: string): void {
  let counter = 0;
  for (const flow of flows) {
    counter++;
    const numberLabel = autonumber ? (prefix ? `${prefix}.${counter}` : `${counter}`) : undefined;

    db.addFlow(
      flow.source,
      flow.target,
      flow.label.replace(/^"|"$/g, ''),
      flow.flowId ?? undefined,
      stripTripleQuotes(flow.description),
      numberLabel
    );

    // Recursively process subflows
    if (flow.subflows.length > 0) {
      processFlows(flow.subflows, db, autonumber, numberLabel ?? `${counter}`);
    }
  }
}

/**
 * Walk a trust boundary AST node recursively, adding elements, flows,
 * threats, and nested boundaries to the DB.
 */
function walkBoundary(
  boundary: Dfd['boundaries'][number],
  db: DfdDB,
  autonumber: boolean,
  flowPrefix: string,
  parentBoundaryId?: string
): number {
  db.addBoundary(boundary.id, boundary.label.replace(/^"|"$/g, ''), parentBoundaryId);
  const boundaryId = boundary.id;

  for (const ext of boundary.externals) {
    db.addElement(ext.id, ext.label.replace(/^"|"$/g, ''), 'external', boundaryId);
  }
  for (const proc of boundary.processes) {
    db.addElement(proc.id, proc.label.replace(/^"|"$/g, ''), 'process', boundaryId);
  }
  for (const ds of boundary.datastores) {
    db.addElement(ds.id, ds.label.replace(/^"|"$/g, ''), 'datastore', boundaryId);
  }
  processFlows(boundary.flows, db, autonumber, flowPrefix);
  for (const threat of boundary.threats) {
    db.addThreat(
      threat.target,
      threat.category as StrideCategory,
      threat.description.replace(/^"|"$/g, ''),
      (threat.severity as SeverityLevel) ?? undefined,
      (threat.status as ThreatStatus) ?? undefined
    );
  }
  for (const child of boundary.boundaries) {
    walkBoundary(child, db, autonumber, flowPrefix, boundaryId);
  }
  return boundary.flows.length;
}

const populateDb = (ast: Dfd, db: DfdDB): void => {
  populateCommonDb(ast, db);

  // Direction
  if (ast.directions.length > 0) {
    const lastDir = ast.directions[ast.directions.length - 1];
    db.setDirection(lastDir.direction as 'LR' | 'RL' | 'TB' | 'BT');
  }

  // Show threats
  db.setShowThreats(ast.showThreats);

  // Autonumber
  db.setAutonumber(ast.autonumber);

  // Top-level elements
  for (const ext of ast.externals) {
    db.addElement(ext.id, ext.label.replace(/^"|"$/g, ''), 'external');
  }
  for (const proc of ast.processes) {
    db.addElement(proc.id, proc.label.replace(/^"|"$/g, ''), 'process');
  }
  for (const ds of ast.datastores) {
    db.addElement(ds.id, ds.label.replace(/^"|"$/g, ''), 'datastore');
  }

  // Boundaries (recursive)
  for (const boundary of ast.boundaries) {
    walkBoundary(boundary, db, ast.autonumber, '');
  }

  // Top-level flows (with recursive subflow numbering)
  processFlows(ast.flows, db, ast.autonumber, '');

  // Top-level threats
  for (const threat of ast.threats) {
    db.addThreat(
      threat.target,
      threat.category as StrideCategory,
      threat.description.replace(/^"|"$/g, ''),
      (threat.severity as SeverityLevel) ?? undefined,
      (threat.status as ThreatStatus) ?? undefined
    );
  }
};

export const parser: ParserDefinition = {
  parse: async (input: string): Promise<void> => {
    const ast: Dfd = await parse('dfd', input);
    log.debug(ast);
    populateDb(ast, db);
  },
};
