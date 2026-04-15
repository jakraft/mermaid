import type { DrawDefinition, SVG } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import { configureSvgSize } from '../../setupGraphViewbox.js';
import type { DfdDB } from './db.js';
import type { DfdElement, DfdTrustBoundary, DfdDirection } from './types.js';
import { STRIDE_COLORS, STRIDE_NAMES } from './types.js';

// Layout constants
const ELEMENT_WIDTH = 160;
const ELEMENT_HEIGHT = 50;
const ELEMENT_PAD_X = 60;
const ELEMENT_PAD_Y = 80;
const BOUNDARY_PAD = 30;
const BADGE_SIZE = 16;
const BADGE_GAP = 3;
const ARROW_HEAD_SIZE = 8;
const TITLE_HEIGHT = 40;

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  element?: DfdElement;
  boundary?: DfdTrustBoundary;
}

/**
 * Simple grid-based layout engine.
 * Places elements in a grid, with boundaries as groups.
 */
function computeLayout(
  elements: Map<string, DfdElement>,
  boundaries: Map<string, DfdTrustBoundary>,
  direction: DfdDirection
): Map<string, LayoutNode> {
  const nodes = new Map<string, LayoutNode>();
  const isHorizontal = direction === 'LR' || direction === 'RL';

  // Collect elements by boundary
  const rootElements: DfdElement[] = [];
  const boundaryElements = new Map<string, DfdElement[]>();

  for (const el of elements.values()) {
    if (el.boundaryId) {
      if (!boundaryElements.has(el.boundaryId)) {
        boundaryElements.set(el.boundaryId, []);
      }
      boundaryElements.get(el.boundaryId)!.push(el);
    } else {
      rootElements.push(el);
    }
  }

  // Get top-level boundaries (no parent)
  const topBoundaries = [...boundaries.values()].filter((b) => !b.parentBoundaryId);

  let currentX = BOUNDARY_PAD;
  let currentY = TITLE_HEIGHT + BOUNDARY_PAD;

  // Layout function for elements within a region
  const layoutElements = (
    elems: DfdElement[],
    startX: number,
    startY: number
  ): { width: number; height: number } => {
    if (elems.length === 0) {
      return { width: 0, height: 0 };
    }

    let x = startX;
    let y = startY;
    let maxWidth = 0;
    let maxHeight = 0;

    for (const el of elems) {
      nodes.set(el.id, {
        id: el.id,
        x,
        y,
        width: ELEMENT_WIDTH,
        height: ELEMENT_HEIGHT,
        element: el,
      });

      if (isHorizontal) {
        y += ELEMENT_HEIGHT + ELEMENT_PAD_Y;
        maxHeight = Math.max(maxHeight, y - startY);
        maxWidth = ELEMENT_WIDTH;
      } else {
        x += ELEMENT_WIDTH + ELEMENT_PAD_X;
        maxWidth = Math.max(maxWidth, x - startX);
        maxHeight = ELEMENT_HEIGHT;
      }
    }

    if (isHorizontal) {
      maxHeight -= ELEMENT_PAD_Y;
    } else {
      maxWidth -= ELEMENT_PAD_X;
    }

    return { width: maxWidth, height: maxHeight };
  };

  // Recursive boundary layout
  const layoutBoundary = (
    boundary: DfdTrustBoundary,
    startX: number,
    startY: number
  ): { width: number; height: number } => {
    const innerX = startX + BOUNDARY_PAD;
    const innerY = startY + BOUNDARY_PAD + 20; // extra for label
    let contentWidth = 0;
    let contentHeight = 0;

    // Layout child elements
    const childElems = boundaryElements.get(boundary.id) ?? [];
    const elemResult = layoutElements(childElems, innerX, innerY);
    contentWidth = elemResult.width;
    contentHeight = elemResult.height;

    // Layout child boundaries
    let childBoundaryOffset = isHorizontal
      ? innerX + (contentWidth > 0 ? contentWidth + ELEMENT_PAD_X : 0)
      : innerY + (contentHeight > 0 ? contentHeight + ELEMENT_PAD_Y : 0);

    for (const childId of boundary.childBoundaryIds) {
      const childBoundary = boundaries.get(childId);
      if (!childBoundary) {
        continue;
      }

      let childResult;
      if (isHorizontal) {
        childResult = layoutBoundary(childBoundary, childBoundaryOffset, innerY);
        childBoundaryOffset += childResult.width + ELEMENT_PAD_X;
        contentWidth = childBoundaryOffset - innerX - ELEMENT_PAD_X;
        contentHeight = Math.max(contentHeight, childResult.height);
      } else {
        childResult = layoutBoundary(childBoundary, innerX, childBoundaryOffset);
        childBoundaryOffset += childResult.height + ELEMENT_PAD_Y;
        contentHeight = childBoundaryOffset - innerY - ELEMENT_PAD_Y;
        contentWidth = Math.max(contentWidth, childResult.width);
      }
    }

    const totalWidth = Math.max(contentWidth + BOUNDARY_PAD * 2, ELEMENT_WIDTH + BOUNDARY_PAD * 2);
    const totalHeight = Math.max(
      contentHeight + BOUNDARY_PAD * 2 + 20,
      ELEMENT_HEIGHT + BOUNDARY_PAD * 2 + 20
    );

    nodes.set(boundary.id, {
      id: boundary.id,
      x: startX,
      y: startY,
      width: totalWidth,
      height: totalHeight,
      boundary,
    });

    return { width: totalWidth, height: totalHeight };
  };

  // Layout root elements first
  if (rootElements.length > 0) {
    const rootResult = layoutElements(rootElements, currentX, currentY);
    if (isHorizontal) {
      currentX += rootResult.width + ELEMENT_PAD_X;
    } else {
      currentY += rootResult.height + ELEMENT_PAD_Y;
    }
  }

  // Layout top-level boundaries
  for (const boundary of topBoundaries) {
    const result = layoutBoundary(boundary, currentX, currentY);
    if (isHorizontal) {
      currentX += result.width + ELEMENT_PAD_X;
    } else {
      currentY += result.height + ELEMENT_PAD_Y;
    }
  }

  return nodes;
}

/** Get the center point of a layout node */
function getCenter(node: LayoutNode): { cx: number; cy: number } {
  return {
    cx: node.x + node.width / 2,
    cy: node.y + node.height / 2,
  };
}

/** Compute intersection point of line from center to edge of rectangle */
function getEdgePoint(
  node: LayoutNode,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const { cx, cy } = getCenter(node);
  const dx = targetX - cx;
  const dy = targetY - cy;
  const w = node.width / 2;
  const h = node.height / 2;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy };
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let scale: number;
  if (absDx / w > absDy / h) {
    scale = w / absDx;
  } else {
    scale = h / absDy;
  }

  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Draw the DFD diagram.
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

  // Compute layout
  const layoutNodes = computeLayout(elements, boundaries, direction);

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

  defs
    .append('marker')
    .attr('id', `${id}-arrowhead-red`)
    .attr('viewBox', `0 0 ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE}`)
    .attr('refX', ARROW_HEAD_SIZE)
    .attr('refY', ARROW_HEAD_SIZE / 2)
    .attr('markerWidth', ARROW_HEAD_SIZE)
    .attr('markerHeight', ARROW_HEAD_SIZE)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', `M 0 0 L ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2} L 0 ${ARROW_HEAD_SIZE} Z`)
    .attr('fill', '#e74c3c');

  const diagramGroup = svg.append('g').attr('class', 'dfd-diagram');

  // Draw title
  if (title) {
    diagramGroup.append('text').attr('class', 'dfd-title').attr('x', 0).attr('y', 25).text(title);
  }

  // Draw boundaries (back to front)
  for (const [, node] of layoutNodes) {
    if (!node.boundary) {
      continue;
    }
    const group = diagramGroup.append('g').attr('class', 'dfd-boundary');

    group
      .append('rect')
      .attr('x', node.x)
      .attr('y', node.y)
      .attr('width', node.width)
      .attr('height', node.height)
      .attr('data-boundary-id', node.id);

    group
      .append('text')
      .attr('x', node.x + 8)
      .attr('y', node.y + 16)
      .text(node.boundary.label);
  }

  // Draw elements
  for (const [, node] of layoutNodes) {
    if (!node.element) {
      continue;
    }
    const el = node.element;
    const group = diagramGroup
      .append('g')
      .attr('class', `dfd-${el.type}`)
      .attr('data-element-id', el.id);

    if (el.type === 'external') {
      // Rectangle
      group
        .append('rect')
        .attr('x', node.x)
        .attr('y', node.y)
        .attr('width', node.width)
        .attr('height', node.height);
    } else if (el.type === 'process') {
      // Rounded rectangle
      group
        .append('rect')
        .attr('x', node.x)
        .attr('y', node.y)
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('rx', 10)
        .attr('ry', 10);
    } else if (el.type === 'datastore') {
      // Open-ended rectangle (two horizontal lines with text between)
      group
        .append('rect')
        .attr('x', node.x)
        .attr('y', node.y)
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('fill', '#ffffff')
        .attr('stroke', 'none');

      group
        .append('line')
        .attr('class', 'ds-top-line')
        .attr('x1', node.x)
        .attr('y1', node.y)
        .attr('x2', node.x + node.width)
        .attr('y2', node.y);

      group
        .append('line')
        .attr('class', 'ds-bottom-line')
        .attr('x1', node.x)
        .attr('y1', node.y + node.height)
        .attr('x2', node.x + node.width)
        .attr('y2', node.y + node.height);
    }

    // Element label
    group
      .append('text')
      .attr('x', node.x + node.width / 2)
      .attr('y', node.y + node.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text(el.label);

    // Draw threat badges
    const elementThreats = threats.filter((t) => t.targetId === el.id);
    if (elementThreats.length > 0) {
      const badgeStartX =
        node.x + node.width / 2 - (elementThreats.length * (BADGE_SIZE + BADGE_GAP)) / 2;
      const badgeY = node.y - BADGE_SIZE - 4;

      for (const [i, threat] of elementThreats.entries()) {
        const isFaded = threat.status === 'mitigated' || threat.status === 'not-applicable';
        const badgeGroup = diagramGroup
          .append('g')
          .attr('class', `dfd-threat-badge${isFaded ? ' faded' : ''}`)
          .attr('data-threat-id', threat.number)
          .attr('data-element-id', el.id);

        const bx = badgeStartX + i * (BADGE_SIZE + BADGE_GAP);

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

  // Draw flows
  for (const flow of flows) {
    const sourceNode = layoutNodes.get(flow.source);
    const targetNode = layoutNodes.get(flow.target);
    if (!sourceNode || !targetNode) {
      log.warn(`Flow references unknown element: ${flow.source} -> ${flow.target}`);
      continue;
    }

    const { cx: targetCx, cy: targetCy } = getCenter(targetNode);
    const { cx: sourceCx, cy: sourceCy } = getCenter(sourceNode);
    const startPoint = getEdgePoint(sourceNode, targetCx, targetCy);
    const endPoint = getEdgePoint(targetNode, sourceCx, sourceCy);

    const flowClass = flow.crossesBoundary ? 'dfd-flow-crossing' : 'dfd-flow';
    const markerRef = flow.crossesBoundary ? `url(#${id}-arrowhead-red)` : `url(#${id}-arrowhead)`;

    const flowGroup = diagramGroup
      .append('g')
      .attr('class', flowClass)
      .attr('data-flow-id', flow.id ?? `flow-${flow.index}`);

    flowGroup
      .append('line')
      .attr('x1', startPoint.x)
      .attr('y1', startPoint.y)
      .attr('x2', endPoint.x)
      .attr('y2', endPoint.y)
      .attr('marker-end', markerRef);

    // Flow label at midpoint
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    flowGroup
      .append('text')
      .attr('x', midX)
      .attr('y', midY - 8)
      .attr('text-anchor', 'middle')
      .text(flow.label);

    // Draw threat badges on flows
    const flowThreats = threats.filter((t) => t.targetId === flow.id);
    if (flowThreats.length > 0) {
      const badgeStartX = midX - (flowThreats.length * (BADGE_SIZE + BADGE_GAP)) / 2;
      const badgeY = midY + 4;

      for (const [i, threat] of flowThreats.entries()) {
        const isFaded = threat.status === 'mitigated' || threat.status === 'not-applicable';
        const badgeGroup = diagramGroup
          .append('g')
          .attr('class', `dfd-threat-badge${isFaded ? ' faded' : ''}`)
          .attr('data-threat-id', threat.number)
          .attr('data-flow-id', flow.id ?? `flow-${flow.index}`);

        const bx = badgeStartX + i * (BADGE_SIZE + BADGE_GAP);

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

  // Draw threat summary table (as SVG foreignObject with HTML table)
  if (showThreats && threats.length > 0) {
    const diagramBBox = getDiagramBounds(layoutNodes);
    const tableY = diagramBBox.maxY + 30;

    const fo = diagramGroup
      .append('foreignObject')
      .attr('x', 0)
      .attr('y', tableY)
      .attr('width', Math.max(diagramBBox.maxX, 800))
      .attr('height', threats.length * 40 + 60);

    const table = fo.append('xhtml:table').attr('class', 'dfd-threat-table');

    // Header
    const thead = table.append('thead').append('tr');
    ['#', 'Element', 'Category', 'Threat', 'Severity', 'Status', 'Description'].forEach((header) =>
      thead.append('th').text(header)
    );

    // Body
    const tbody = table.append('tbody');
    for (const threat of threats) {
      const targetElement = elements.get(threat.targetId);
      const targetFlow = flows.find((f) => f.id === threat.targetId);
      const elementLabel = targetElement
        ? targetElement.label
        : targetFlow
          ? `${targetFlow.source} → ${targetFlow.target}`
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
      row.append('td').text(threat.category);
      row.append('td').text(STRIDE_NAMES[threat.category]);
      row
        .append('td')
        .attr('class', threat.severity ? `severity-${threat.severity}` : '')
        .text(threat.severity ?? '—');
      row.append('td').text(threat.status);
      row.append('td').text(threat.description);
    }
  }

  // Compute total dimensions and configure SVG size
  const bounds = getDiagramBounds(layoutNodes);
  let totalHeight = bounds.maxY + BOUNDARY_PAD;
  if (showThreats && threats.length > 0) {
    totalHeight += threats.length * 40 + 90;
  }
  const totalWidth = Math.max(bounds.maxX + BOUNDARY_PAD, 400);

  // Center the title
  if (title) {
    diagramGroup.select('.dfd-title').attr('x', totalWidth / 2);
  }

  svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  configureSvgSize(svg, totalHeight, totalWidth, true);
};

function getDiagramBounds(nodes: Map<string, LayoutNode>): {
  maxX: number;
  maxY: number;
} {
  let maxX = 0;
  let maxY = 0;
  for (const [, node] of nodes) {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return { maxX, maxY };
}

export const renderer = { draw };
