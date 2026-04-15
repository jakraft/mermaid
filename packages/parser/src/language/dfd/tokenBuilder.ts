import { AbstractMermaidTokenBuilder } from '../common/index.js';

export class DfdTokenBuilder extends AbstractMermaidTokenBuilder {
  public constructor() {
    super(['dfd-beta', 'showThreats']);
  }
}
