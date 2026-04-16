import type { DrawDefinition, SVG } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import { configureSvgSize } from '../../setupGraphViewbox.js';
import { line, curveBasis } from 'd3';
import ELK from 'elkjs/lib/elk.bundled.js';

import type { DfdDB } from './db.js';
import type { DfdTrustBoundary } from './types.js';
import { STRIDE_COLORS, STRIDE_EMOJIS, STRIDE_NAMES } from './types.js';

// Layout constants
const ELEMENT_WIDTH = 160;
const ELEMENT_HEIGHT = 50;
const BOUNDARY_PAD = 30;
const BADGE_SIZE = 16;
const BADGE_GAP = 3;
const ARROW_HEAD_SIZE = 8;
const TITLE_HEIGHT = 40;

/** Map DFD direction to ELK direction */
function toElkDirection(dir: string): string {
  switch (dir) {
    case 'LR':
      return 'RIGHT';
    case 'RL':
      return 'LEFT';
    case 'BT':
      return 'UP';
    default:
      return 'DOWN';
  }
}

interface ElkNode {
  id: string;
  width: number;
  height: number;
  children?: ElkNode[];
  labels?: { text: string }[];
  layoutOptions?: Record<string, unknown>;
  // Populated after layout
  x?: number;
  y?: number;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: { text: string; width: number; height: number }[];
  // Populated after layout
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
}

interface ElkGraph {
  id: string;
  layoutOptions: Record<string, unknown>;
  children: ElkNode[];
  edges: ElkEdge[];
}

/**
 * Draw the DFD diagram using ELK for automatic layout.
 */
export const draw: DrawDefinition = async (text, id, _version, diagObj) => {
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

  // Pre-compute element widths accounting for badges
  const LABEL_CHAR_WIDTH = 8;
  const LABEL_PAD = 20;
  const BADGE_LABEL_GAP = 8;

  function computeNodeWidth(elId: string, label: string): number {
    const elementThreats = threats.filter((t) => t.targetId === elId);
    const labelWidth = label.length * LABEL_CHAR_WIDTH;
    const badgesWidth =
      elementThreats.length > 0
        ? BADGE_LABEL_GAP + elementThreats.length * (BADGE_SIZE + BADGE_GAP) - BADGE_GAP
        : 0;
    return Math.max(ELEMENT_WIDTH, labelWidth + badgesWidth + LABEL_PAD);
  }

  // Build ELK graph with hierarchical structure
  function buildBoundaryChildren(boundaryId: string, boundary: DfdTrustBoundary): ElkNode {
    const children: ElkNode[] = [];

    // Add child elements
    for (const [elId, el] of elements) {
      if (el.boundaryId === boundaryId) {
        children.push({
          id: elId,
          width: computeNodeWidth(elId, el.label),
          height: ELEMENT_HEIGHT,
          labels: [{ text: el.label }],
        });
      }
    }

    // Add child boundaries (recursion)
    for (const childBId of boundary.childBoundaryIds) {
      const childBoundary = boundaries.get(childBId);
      if (childBoundary) {
        children.push(buildBoundaryChildren(childBId, childBoundary));
      }
    }

    return {
      id: boundaryId,
      width: 0,
      height: 0,
      children,
      labels: [{ text: boundary.label }],
      layoutOptions: {
        'elk.padding': '[top=35,left=15,bottom=15,right=15]',
      },
    };
  }

  // Build the root children array
  const rootChildren: ElkNode[] = [];

  // Add top-level boundaries (no parent)
  for (const [bId, boundary] of boundaries) {
    if (!boundary.parentBoundaryId) {
      rootChildren.push(buildBoundaryChildren(bId, boundary));
    }
  }

  // Add top-level elements (no boundary)
  for (const [elId, el] of elements) {
    if (!el.boundaryId) {
      rootChildren.push({
        id: elId,
        width: computeNodeWidth(elId, el.label),
        height: ELEMENT_HEIGHT,
        labels: [{ text: el.label }],
      });
    }
  }

  // Build edges
  const elkEdges: ElkEdge[] = flows.map((flow) => ({
    id: flow.id ?? `flow-${flow.index}`,
    sources: [flow.source],
    targets: [flow.target],
  }));

  const elkGraph: ElkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': toElkDirection(direction),
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'spacing.baseValue': '40',
      'elk.layered.mergeHierarchyEdges': 'true',
      'elk.padding': `[top=${TITLE_HEIGHT + BOUNDARY_PAD},left=${BOUNDARY_PAD},bottom=${BOUNDARY_PAD},right=${BOUNDARY_PAD}]`,
      'spacing.nodeNode': '60',
      'spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.unnecessaryBendpoints': 'true',
    },
    children: rootChildren,
    edges: elkEdges,
  };

  // Run ELK layout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elk = new (ELK as any)();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layoutResult = await elk.layout(elkGraph as any);

  // Build a lookup of positioned nodes (flatten hierarchy)
  const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();

  function collectNodePositions(
    nodes: ElkNode[] | undefined,
    offsetX: number,
    offsetY: number
  ): void {
    if (!nodes) {
      return;
    }
    for (const node of nodes) {
      const absX = (node.x ?? 0) + offsetX;
      const absY = (node.y ?? 0) + offsetY;
      nodePositions.set(node.id, {
        x: absX,
        y: absY,
        width: node.width,
        height: node.height,
      });
      if (node.children) {
        collectNodePositions(node.children, absX, absY);
      }
    }
  }

  collectNodePositions(layoutResult.children as ElkNode[], 0, 0);

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

  // Draw boundaries
  for (const [bId, boundary] of boundaries) {
    const pos = nodePositions.get(bId);
    if (!pos) {
      continue;
    }

    const group = diagramGroup.append('g').attr('class', 'dfd-boundary');

    group
      .append('rect')
      .attr('x', pos.x)
      .attr('y', pos.y)
      .attr('width', pos.width)
      .attr('height', pos.height)
      .attr('data-boundary-id', bId);

    group
      .append('text')
      .attr('x', pos.x + 8)
      .attr('y', pos.y + 16)
      .text(boundary.label);
  }

  // Draw elements — ELK gives top-left x/y
  for (const [elId, el] of elements) {
    const pos = nodePositions.get(elId);
    if (!pos) {
      continue;
    }
    const nx = pos.x;
    const ny = pos.y;
    const cx = nx + pos.width / 2;
    const cy = ny + pos.height / 2;

    const group = diagramGroup
      .append('g')
      .attr('class', `dfd-${el.type}`)
      .attr('data-element-id', elId);

    if (el.type === 'external') {
      group
        .append('rect')
        .attr('x', nx)
        .attr('y', ny)
        .attr('width', pos.width)
        .attr('height', pos.height);
    } else if (el.type === 'process') {
      group
        .append('rect')
        .attr('x', nx)
        .attr('y', ny)
        .attr('width', pos.width)
        .attr('height', pos.height)
        .attr('rx', 10)
        .attr('ry', 10);
    } else if (el.type === 'datastore') {
      const ry = 8;
      const topY = ny + ry;
      const bottomY = ny + pos.height - ry;
      const halfW = pos.width / 2;

      group
        .append('rect')
        .attr('class', 'ds-body')
        .attr('x', nx)
        .attr('y', topY)
        .attr('width', pos.width)
        .attr('height', bottomY - topY);

      group
        .append('line')
        .attr('class', 'ds-side')
        .attr('x1', nx)
        .attr('y1', topY)
        .attr('x2', nx)
        .attr('y2', bottomY);

      group
        .append('line')
        .attr('class', 'ds-side')
        .attr('x1', nx + pos.width)
        .attr('y1', topY)
        .attr('x2', nx + pos.width)
        .attr('y2', bottomY);

      group
        .append('path')
        .attr('class', 'ds-bottom-cap')
        .attr('d', `M ${nx},${bottomY} A ${halfW},${ry} 0 0,0 ${nx + pos.width},${bottomY}`);

      group
        .append('ellipse')
        .attr('class', 'ds-top-cap')
        .attr('cx', cx)
        .attr('cy', topY)
        .attr('rx', halfW)
        .attr('ry', ry);
    }

    // Element label + threat badges
    const elementThreats = threats.filter((t) => t.targetId === elId);
    const badgesWidth =
      elementThreats.length > 0
        ? 8 + elementThreats.length * (BADGE_SIZE + BADGE_GAP) - BADGE_GAP
        : 0;

    const labelYOffset = el.type === 'datastore' ? 4 : 0;
    const labelX = cx - badgesWidth / 2;
    group
      .append('text')
      .attr('x', labelX)
      .attr('y', cy + labelYOffset)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text(el.label);

    // Draw threat badges to the right of the label
    if (elementThreats.length > 0) {
      const labelHalfWidth = (el.label.length * 8) / 2;
      const badgeStartX = labelX + labelHalfWidth + 8;
      const badgeY = cy + labelYOffset - BADGE_SIZE / 2;

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

  // Draw flows using ELK edge sections
  const curvedLine = line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveBasis);

  // Collect label data for a second pass (rendered on top)
  const flowLabels: { x: number; y: number; text: string; description?: string }[] = [];

  // Build edge lookup from ELK result (edges live on the root or inside subgraphs)
  const edgeSections = new Map<
    string,
    {
      startPoint: { x: number; y: number };
      endPoint: { x: number; y: number };
      bendPoints?: { x: number; y: number }[];
    }
  >();

  function collectEdgeSections(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graph: any,
    offsetX: number,
    offsetY: number
  ): void {
    if (graph.edges) {
      for (const edge of graph.edges) {
        if (edge.sections?.[0]) {
          const s = edge.sections[0];
          edgeSections.set(edge.id, {
            startPoint: { x: s.startPoint.x + offsetX, y: s.startPoint.y + offsetY },
            endPoint: { x: s.endPoint.x + offsetX, y: s.endPoint.y + offsetY },
            bendPoints: s.bendPoints?.map((p: { x: number; y: number }) => ({
              x: p.x + offsetX,
              y: p.y + offsetY,
            })),
          });
        }
      }
    }
    if (graph.children) {
      for (const child of graph.children) {
        if (child.children || child.edges) {
          const childX = (child.x ?? 0) + offsetX;
          const childY = (child.y ?? 0) + offsetY;
          collectEdgeSections(child, childX, childY);
        }
      }
    }
  }

  collectEdgeSections(layoutResult, 0, 0);

  for (const flow of flows) {
    const edgeName = flow.id ?? `flow-${flow.index}`;
    const section = edgeSections.get(edgeName);
    if (!section) {
      log.warn(`No edge sections for flow: ${flow.source} -> ${flow.target}`);
      continue;
    }

    const points: [number, number][] = [
      [section.startPoint.x, section.startPoint.y],
      ...(section.bendPoints?.map((p) => [p.x, p.y] as [number, number]) ?? []),
      [section.endPoint.x, section.endPoint.y],
    ];

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
    const midIdx = Math.floor(points.length / 2);
    const midPoint = points[midIdx];
    const displayLabel = flow.numberLabel ? `${flow.numberLabel}. ${flow.label}` : flow.label;
    flowLabels.push({
      x: midPoint[0],
      y: midPoint[1] - 8,
      text: displayLabel,
      description: flow.description,
    });

    // Draw threat badges on flows
    const flowThreats = threats.filter((t) => t.targetId === flow.id);
    if (flowThreats.length > 0) {
      const badgeStartX = midPoint[0] - (flowThreats.length * (BADGE_SIZE + BADGE_GAP)) / 2;
      const badgeY = midPoint[1] + 4;

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

  // Compute graph bounds from positioned nodes
  const bounds = getGraphBounds(nodePositions);
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

/** Compute bounding box from ELK-positioned nodes */
function getGraphBounds(
  nodePositions: Map<string, { x: number; y: number; width: number; height: number }>
): { maxX: number; maxY: number } {
  let maxX = 0;
  let maxY = 0;
  for (const pos of nodePositions.values()) {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }
  return { maxX, maxY };
}

export const renderer = { draw };
