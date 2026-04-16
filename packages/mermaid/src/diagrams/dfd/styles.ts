import type { DiagramStylesProvider } from '../../diagram-api/types.js';

const getStyles: DiagramStylesProvider = () =>
  `
  /* DFD Element Styles - Black & White */
  .dfd-external rect {
    fill: #ffffff;
    stroke: #333333;
    stroke-width: 2px;
  }
  .dfd-external text {
    fill: #333333;
    font-weight: normal;
  }

  .dfd-process rect {
    fill: #ffffff;
    stroke: #333333;
    stroke-width: 2px;
    rx: 10;
    ry: 10;
  }
  .dfd-process text {
    fill: #333333;
    font-weight: normal;
  }

  .dfd-datastore .ds-body {
    fill: #ffffff;
    stroke: none;
  }
  .dfd-datastore .ds-side {
    stroke: #333333;
    stroke-width: 2px;
  }
  .dfd-datastore .ds-top-cap {
    fill: #ffffff;
    stroke: #333333;
    stroke-width: 2px;
  }
  .dfd-datastore .ds-bottom-cap {
    fill: none;
    stroke: #333333;
    stroke-width: 2px;
  }
  .dfd-datastore text {
    fill: #333333;
    font-weight: normal;
  }

  /* Data Flow Arrows */
  .dfd-flow path {
    stroke: #333333;
    stroke-width: 1.5px;
  }
  .dfd-flow text {
    fill: #333333;
    font-size: 12px;
    stroke: #ffffff;
    stroke-width: 4px;
    paint-order: stroke;
  }
  .dfd-flow marker path {
    fill: #333333;
  }



  /* Trust Boundaries */
  .dfd-boundary rect {
    fill: none;
    stroke: #e74c3c;
    stroke-width: 2px;
    stroke-dasharray: 8, 4;
  }
  .dfd-boundary text {
    fill: #e74c3c;
    font-weight: bold;
    font-size: 13px;
  }

  /* Threat Badges */
  .dfd-threat-badge {
    cursor: pointer;
  }
  .dfd-threat-badge rect {
    rx: 2;
    ry: 2;
  }
  .dfd-threat-badge text {
    fill: #ffffff;
    font-size: 10px;
    font-weight: bold;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .dfd-threat-badge.faded rect {
    opacity: 0.5;
  }
  .dfd-threat-badge.faded text {
    opacity: 0.7;
  }

  /* Threat Summary Table */
  .dfd-threat-table {
    font-family: inherit;
    border-collapse: collapse;
    width: 100%;
    margin-top: 16px;
  }
  .dfd-threat-table th,
  .dfd-threat-table td {
    border: 1px solid #dddddd;
    padding: 8px 12px;
    white-space: normal;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
  .dfd-threat-table th {
    background-color: #f5f5f5;
    text-align: left;
    font-weight: bold;
    white-space: nowrap;
  }

  .threat-category-badge {
    display: inline-block;
    color: #ffffff;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .dfd-threat-table tr.threat-mitigated td,
  .dfd-threat-table tr.threat-not-applicable td {
    color: #999999;
    text-decoration: line-through;
  }
  .dfd-threat-table .severity-critical { color: #e74c3c; font-weight: bold; }
  .dfd-threat-table .severity-high { color: #e67e22; font-weight: bold; }
  .dfd-threat-table .severity-medium { color: #f1c40f; }
  .dfd-threat-table .severity-low { color: #27ae60; }

  /* Title */
  .dfd-title {
    font-size: 18px;
    font-weight: bold;
    fill: #333333;
    text-anchor: middle;
  }
`;

export default getStyles;
