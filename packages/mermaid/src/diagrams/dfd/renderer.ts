import type { DrawDefinition, SVG } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import { configureSvgSize } from '../../setupGraphViewbox.js';
import { line, curveBasis } from 'd3';

import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/index.js';

import * as graphlib from 'dagre-d3-es/src/graphlib/index.js';
import type { DfdDB } from './db.js';
import type { DfdElement } from './types.js';
import { STRIDE_COLORS, STRIDE_EMOJIS, STRIDE_NAMES } from './types.js';

// Layout constants
const ELEMENT_WIDTH = 160;
const ELEMENT_HEIGHT = 50;
const BOUNDARY_PAD = 30;
const BADGE_SIZE = 16;
const BADGE_GAP = 3;
const ARROW_HEAD_SIZE = 8;
const TITLE_HEIGHT = 40;

/** Map DFD direction to dagre rankdir */
function toRankdir(dir: string): string {
  switch (dir) {
    case 'LR':
      return 'LR';
    case 'RL':
      return 'RL';
    case 'BT':
      return 'BT';
    default:
      return 'TB';
  }
}

/**
 * Draw the DFD diagram using dagre for automatic layout.
 */
export const draw: DrawDefinition = (text, id, _version, diagObj) => {
  log.debug('rendering dfd diagram\n' + text);
  const db = diagObj.db as DfdDB;
  const svg: SVG = selectSvgElement(id);

  const elements = db.getElements();
  const flows = db.getFlows();
  const boundaries = db.getBoundaries();
  const threats = db.getThreats();
  const direction = db.getDirection();
  const showThreats = db.getShowThreats();
  const title = db.getDiagramTitle();

  // Build dagre graph
  const graph = new graphlib.Graph({ multigraph: true, compound: true }).setGraph({
    rankdir: toRankdir(direction),
    nodesep: 60,
    ranksep: 80,
    marginx: BOUNDARY_PAD,
    marginy: TITLE_HEIGHT + BOUNDARY_PAD,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  // Add boundary nodes as compound parents
  for (const [bId, boundary] of boundaries) {
    graph.setNode(bId, {
      label: boundary.label,
      clusterLabelPos: 'top',
      width: 0,
      height: 0,
    });
    if (boundary.parentBoundaryId) {
      graph.setParent(bId, boundary.parentBoundaryId);
    }
  }

  // Pre-compute element widths accounting for badges to the right of the label
  const LABEL_CHAR_WIDTH = 8; // approximate width per character
  const LABEL_PAD = 20; // padding around label text
  const BADGE_LABEL_GAP = 8; // gap between label and first badge

  // Add element nodes — width includes label + badges
  for (const [elId, el] of elements) {
    const elementThreats = threats.filter((t) => t.targetId === elId);
    const labelWidth = el.label.length * LABEL_CHAR_WIDTH;
    const badgesWidth =
      elementThreats.length > 0
        ? BADGE_LABEL_GAP + elementThreats.length * (BADGE_SIZE + BADGE_GAP) - BADGE_GAP
        : 0;
    const nodeWidth = Math.max(ELEMENT_WIDTH, labelWidth + badgesWidth + LABEL_PAD);
    graph.setNode(elId, {
      label: el.label,
      width: nodeWidth,
      height: ELEMENT_HEIGHT,
    });
    if (el.boundaryId) {
      graph.setParent(elId, el.boundaryId);
    }
  }

  // Add edges (flows) — use multigraph edge names for parallel edges
  for (const flow of flows) {
    const edgeName = flow.id ?? `flow-${flow.index}`;
    graph.setEdge(flow.source, flow.target, { label: flow.label, flowIndex: flow.index }, edgeName);
  }

  // Run dagre layout
  dagreLayout(graph, undefined);

  // Define arrow markers
  const defs = svg.append('defs');
  defs
    .append('marker')
    .attr('id', `${id}-arrowhead`)
    .attr('viewBox', `0 0 ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE}`)
    .attr('refX', ARROW_HEAD_SIZE)
    .attr('refY', ARROW_HEAD_SIZE / 2)
    .attr('markerWidth', ARROW_HEAD_SIZE)
    .attr('markerHeight', ARROW_HEAD_SIZE)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', `M 0 0 L ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2} L 0 ${ARROW_HEAD_SIZE} Z`)
    .attr('fill', '#333333');

  const diagramGroup = svg.append('g').attr('class', 'dfd-diagram');

  // Draw title
  if (title) {
    diagramGroup.append('text').attr('class', 'dfd-title').attr('x', 0).attr('y', 25).text(title);
  }

  // Draw boundaries — dagre sets x/y/width/height on compound nodes
  for (const [bId, boundary] of boundaries) {
    const bNode = graph.node(bId);
    if (!bNode) {
      continue;
    }
    // dagre gives center-based coords for compound nodes
    const bx = bNode.x - bNode.width / 2;
    const by = bNode.y - bNode.height / 2;

    const group = diagramGroup.append('g').attr('class', 'dfd-boundary');

    group
      .append('rect')
      .attr('x', bx)
      .attr('y', by)
      .attr('width', bNode.width)
      .attr('height', bNode.height)
      .attr('data-boundary-id', bId);

    group
      .append('text')
      .attr('x', bx + 8)
      .attr('y', by + 16)
      .text(boundary.label);
  }

  // Draw elements — dagre gives center-based x/y
  for (const [elId, el] of elements) {
    const elNode = graph.node(elId);
    if (!elNode) {
      continue;
    }
    const nx = elNode.x - elNode.width / 2;
    const ny = elNode.y - elNode.height / 2;

    const group = diagramGroup
      .append('g')
      .attr('class', `dfd-${el.type}`)
      .attr('data-element-id', elId);

    if (el.type === 'external') {
      group
        .append('rect')
        .attr('x', nx)
        .attr('y', ny)
        .attr('width', elNode.width)
        .attr('height', elNode.height);
    } else if (el.type === 'process') {
      group
        .append('rect')
        .attr('x', nx)
        .attr('y', ny)
        .attr('width', elNode.width)
        .attr('height', elNode.height)
        .attr('rx', 10)
        .attr('ry', 10);
    } else if (el.type === 'datastore') {
      const ry = 8; // ellipse vertical radius for cylinder caps
      const topY = ny + ry;
      const bottomY = ny + elNode.height - ry;
      const halfW = elNode.width / 2;

      // White fill for the body area (no stroke)
      group
        .append('rect')
        .attr('class', 'ds-body')
        .attr('x', nx)
        .attr('y', topY)
        .attr('width', elNode.width)
        .attr('height', bottomY - topY);

      // Left side line
      group
        .append('line')
        .attr('class', 'ds-side')
        .attr('x1', nx)
        .attr('y1', topY)
        .attr('x2', nx)
        .attr('y2', bottomY);

      // Right side line
      group
        .append('line')
        .attr('class', 'ds-side')
        .attr('x1', nx + elNode.width)
        .attr('y1', topY)
        .attr('x2', nx + elNode.width)
        .attr('y2', bottomY);

      // Bottom half-ellipse arc (only the bottom curve)
      group
        .append('path')
        .attr('class', 'ds-bottom-cap')
        .attr('d', `M ${nx},${bottomY} A ${halfW},${ry} 0 0,0 ${nx + elNode.width},${bottomY}`);

      // Top ellipse (full)
      group
        .append('ellipse')
        .attr('class', 'ds-top-cap')
        .attr('cx', elNode.x)
        .attr('cy', topY)
        .attr('rx', halfW)
        .attr('ry', ry);
    }

    // Element label + threat badges — label left-of-center, badges to its right
    const elementThreats = threats.filter((t) => t.targetId === elId);
    const badgesWidth =
      elementThreats.length > 0
        ? 8 + elementThreats.length * (BADGE_SIZE + BADGE_GAP) - BADGE_GAP
        : 0;

    // Center the label+badges group within the element
    // For datastores, shift down slightly to account for the top ellipse cap
    const labelYOffset = el.type === 'datastore' ? 4 : 0;
    const labelX = elNode.x - badgesWidth / 2;
    group
      .append('text')
      .attr('x', labelX)
      .attr('y', elNode.y + labelYOffset)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text(el.label);

    // Draw threat badges to the right of the label
    if (elementThreats.length > 0) {
      const labelHalfWidth = (el.label.length * 8) / 2; // approximate
      const badgeStartX = labelX + labelHalfWidth + 8;
      const badgeY = elNode.y + labelYOffset - BADGE_SIZE / 2;

      for (const [i, threat] of elementThreats.entries()) {
        const isFaded = threat.status === 'mitigated' || threat.status === 'not-applicable';
        const badgeGroup = diagramGroup
          .append('g')
          .attr('class', `dfd-threat-badge${isFaded ? ' faded' : ''}`)
          .attr('data-threat-id', threat.number)
          .attr('data-element-id', elId);

        const bx = badgeStartX + i * (BADGE_SIZE + BADGE_GAP);

        badgeGroup.append('title').text(`${STRIDE_NAMES[threat.category]}: ${threat.description}`);

        badgeGroup
          .append('rect')
          .attr('x', bx)
          .attr('y', badgeY)
          .attr('width', BADGE_SIZE)
          .attr('height', BADGE_SIZE)
          .attr('fill', STRIDE_COLORS[threat.category]);

        badgeGroup
          .append('text')
          .attr('x', bx + BADGE_SIZE / 2)
          .attr('y', badgeY + BADGE_SIZE / 2)
          .text(String(threat.number));
      }
    }
  }

  // Draw flows using dagre edge points
  const curvedLine = line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveBasis);

  // Collect label data for a second pass (rendered on top)
  const flowLabels: { x: number; y: number; text: string; description?: string }[] = [];

  for (const flow of flows) {
    const edgeName = flow.id ?? `flow-${flow.index}`;
    const edgeObj = graph.edge({ v: flow.source, w: flow.target, name: edgeName });
    if (!edgeObj?.points) {
      log.warn(`No edge points for flow: ${flow.source} -> ${flow.target}`);
      continue;
    }

    const points: [number, number][] = edgeObj.points.map(
      (p: { x: number; y: number }) => [p.x, p.y] as [number, number]
    );

    const flowGroup = diagramGroup
      .append('g')
      .attr('class', 'dfd-flow')
      .attr('data-flow-id', edgeName);

    flowGroup
      .append('path')
      .attr('d', curvedLine(points))
      .attr('fill', 'none')
      .attr('marker-end', `url(#${id}-arrowhead)`);

    // Collect label for top-layer rendering
    const midIdx = Math.floor(edgeObj.points.length / 2);
    const midPoint = edgeObj.points[midIdx];
    const displayLabel = flow.numberLabel ? `${flow.numberLabel}. ${flow.label}` : flow.label;
    flowLabels.push({
      x: midPoint.x,
      y: midPoint.y - 8,
      text: displayLabel,
      description: flow.description,
    });

    // Draw threat badges on flows
    const flowThreats = threats.filter((t) => t.targetId === flow.id);
    if (flowThreats.length > 0) {
      const badgeStartX = midPoint.x - (flowThreats.length * (BADGE_SIZE + BADGE_GAP)) / 2;
      const badgeY = midPoint.y + 4;

      for (const [i, threat] of flowThreats.entries()) {
        const isFaded = threat.status === 'mitigated' || threat.status === 'not-applicable';
        const badgeGroup = diagramGroup
          .append('g')
          .attr('class', `dfd-threat-badge${isFaded ? ' faded' : ''}`)
          .attr('data-threat-id', threat.number)
          .attr('data-flow-id', edgeName);

        const bx = badgeStartX + i * (BADGE_SIZE + BADGE_GAP);

        badgeGroup.append('title').text(`${STRIDE_NAMES[threat.category]}: ${threat.description}`);

        badgeGroup
          .append('rect')
          .attr('x', bx)
          .attr('y', badgeY)
          .attr('width', BADGE_SIZE)
          .attr('height', BADGE_SIZE)
          .attr('fill', STRIDE_COLORS[threat.category]);

        badgeGroup
          .append('text')
          .attr('x', bx + BADGE_SIZE / 2)
          .attr('y', badgeY + BADGE_SIZE / 2)
          .text(String(threat.number));
      }
    }
  }

  // Render flow labels in a top-layer group so they're always above other elements
  const flowLabelLayer = diagramGroup.append('g').attr('class', 'dfd-flow-labels');
  for (const label of flowLabels) {
    const labelGroup = flowLabelLayer.append('g').attr('class', 'dfd-flow');
    if (label.description) {
      labelGroup.append('title').text(label.description);
    }
    labelGroup
      .append('text')
      .attr('x', label.x)
      .attr('y', label.y)
      .attr('text-anchor', 'middle')
      .text(label.text);
  }

  // Compute graph bounds and width first
  const bounds = getGraphBounds(graph, elements, boundaries);
  const TABLE_MIN_WIDTH = 1000;
  const hasTable = showThreats && threats.length > 0;
  const totalWidth = Math.max(bounds.maxX + BOUNDARY_PAD, hasTable ? TABLE_MIN_WIDTH : 0, 400);

  // Draw threat summary table (as SVG foreignObject with HTML table)
  let tableActualHeight = 0;
  if (hasTable) {
    const tableY = bounds.maxY + 30;

    const fo = diagramGroup
      .append('foreignObject')
      .attr('x', 0)
      .attr('y', tableY)
      .attr('width', totalWidth)
      .attr('height', 10000)
      .attr('overflow', 'visible');

    const table = fo.append('xhtml:table').attr('class', 'dfd-threat-table');

    // Header
    const thead = table.append('thead').append('tr');
    ['#', 'Element', 'Threat', 'Severity', 'Status'].forEach((header) =>
      thead.append('th').text(header)
    );

    // Body
    const tbody = table.append('tbody');
    for (const threat of threats) {
      const targetElement = elements.get(threat.targetId);
      const targetFlow = flows.find((f) => f.id === threat.targetId);
      const flowLabel = targetFlow
        ? `${elements.get(targetFlow.source)?.label ?? targetFlow.source} → ${elements.get(targetFlow.target)?.label ?? targetFlow.target}`
        : undefined;
      const elementLabel = targetElement
        ? targetElement.label
        : flowLabel
          ? targetFlow?.numberLabel
            ? `${targetFlow.numberLabel}. ${flowLabel}`
            : flowLabel
          : threat.targetId;

      const rowClass =
        threat.status === 'mitigated'
          ? 'threat-mitigated'
          : threat.status === 'not-applicable'
            ? 'threat-not-applicable'
            : '';

      const row = tbody.append('tr').attr('class', rowClass).attr('data-threat-id', threat.number);

      row.append('td').text(String(threat.number));
      row.append('td').text(elementLabel);
      // Threat name with colored category badge
      const threatTd = row.append('td');
      threatTd
        .append('span')
        .attr('class', 'threat-category-badge')
        .attr('style', `background-color: ${STRIDE_COLORS[threat.category]}`)
        .text(`${STRIDE_EMOJIS[threat.category]} ${STRIDE_NAMES[threat.category]}`);
      threatTd.append('span').text(` ${threat.description}`);
      row
        .append('td')
        .attr('class', threat.severity ? `severity-${threat.severity}` : '')
        .text(threat.severity ?? '—');
      row.append('td').text(threat.status);
    }

    // Measure actual rendered table height from the DOM
    const tableNode = table.node() as HTMLElement | null;
    tableActualHeight =
      tableNode?.offsetHeight ?? tableNode?.scrollHeight ?? threats.length * 60 + 80;
    fo.attr('height', tableActualHeight);
  }

  // Compute final SVG height using measured table height
  let totalHeight = bounds.maxY + BOUNDARY_PAD;
  if (tableActualHeight > 0) {
    totalHeight += tableActualHeight + 30;
  }

  // Center the title
  if (title) {
    diagramGroup.select('.dfd-title').attr('x', totalWidth / 2);
  }

  svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  configureSvgSize(svg, totalHeight, totalWidth, true);
};

/** Compute bounding box from dagre-laid-out graph nodes */

function getGraphBounds(
  graph: any,
  elements: Map<string, DfdElement>,
  boundaries: Map<string, unknown>
): { maxX: number; maxY: number } {
  let maxX = 0;
  let maxY = 0;
  for (const nodeId of graph.nodes()) {
    // Only measure elements and boundaries, not internal dagre artifacts
    if (!elements.has(nodeId) && !boundaries.has(nodeId)) {
      continue;
    }
    const node = graph.node(nodeId);
    if (node) {
      maxX = Math.max(maxX, node.x + node.width / 2);
      maxY = Math.max(maxY, node.y + node.height / 2);
    }
  }
  return { maxX, maxY };
}

export const renderer = { draw };
