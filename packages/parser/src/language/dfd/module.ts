import type {
  DefaultSharedCoreModuleContext,
  LangiumCoreServices,
  LangiumSharedCoreServices,
  Module,
  PartialLangiumCoreServices,
} from 'langium';
import {
  EmptyFileSystem,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';

import {
  MermaidGeneratedSharedModule,
  DfdGrammarGeneratedModule as DfdGeneratedModule,
} from '../generated/module.js';
import { DfdTokenBuilder } from './tokenBuilder.js';
import { DfdValueConverter } from './valueConverter.js';

interface DfdAddedServices {
  parser: {
    TokenBuilder: DfdTokenBuilder;
    ValueConverter: DfdValueConverter;
  };
}

export type DfdServices = LangiumCoreServices & DfdAddedServices;

export const DfdModule: Module<DfdServices, PartialLangiumCoreServices & DfdAddedServices> = {
  parser: {
    TokenBuilder: () => new DfdTokenBuilder(),
    ValueConverter: () => new DfdValueConverter(),
  },
};

export function createDfdServices(context: DefaultSharedCoreModuleContext = EmptyFileSystem): {
  shared: LangiumSharedCoreServices;
  Dfd: DfdServices;
} {
  const shared: LangiumSharedCoreServices = inject(
    createDefaultSharedCoreModule(context),
    MermaidGeneratedSharedModule
  );
  const Dfd: DfdServices = inject(
    createDefaultCoreModule({ shared }),
    DfdGeneratedModule,
    DfdModule
  );
  shared.ServiceRegistry.register(Dfd);
  return { shared, Dfd };
}
