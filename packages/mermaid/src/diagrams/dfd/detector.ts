import type {
  DiagramDetector,
  DiagramLoader,
  ExternalDiagramDefinition,
} from '../../diagram-api/types.js';

const id = 'dfd';

const detector: DiagramDetector = (txt) => {
  return /^\s*dfd-beta/.test(txt);
};

const loader: DiagramLoader = async () => {
  const { diagram } = await import('./diagram.js');
  return { id, diagram };
};

export const dfd: ExternalDiagramDefinition = {
  id,
  detector,
  loader,
};
