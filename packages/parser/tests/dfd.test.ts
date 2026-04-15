import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse.js';

describe('dfd', () => {
  describe('basic parsing', () => {
    it('should parse a minimal DFD', async () => {
      const result = await parse('dfd', `dfd-beta\n`);
      expect(result.$type).toBe('Dfd');
      expect(result.showThreats).toBe(false);
    });

    it('should parse dfd-beta with showThreats', async () => {
      const result = await parse('dfd', `dfd-beta showThreats\n`);
      expect(result.showThreats).toBe(true);
    });

    it('should parse title and accessibility', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  title My Threat Model
  accTitle: DFD for system
  accDescr: A data flow diagram
`
      );
      expect(result.title).toBe('My Threat Model');
      expect(result.accTitle).toBe('DFD for system');
      expect(result.accDescr).toBe('A data flow diagram');
    });
  });

  describe('elements', () => {
    it('should parse external entities', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "Web User"
  external admin "Admin"
`
      );
      expect(result.externals).toHaveLength(2);
      expect(result.externals[0].id).toBe('user');
      expect(result.externals[0].label).toBe('Web User');
      expect(result.externals[1].id).toBe('admin');
    });

    it('should parse processes', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth Service"
  process api "API Gateway"
`
      );
      expect(result.processes).toHaveLength(2);
      expect(result.processes[0].id).toBe('auth');
      expect(result.processes[0].label).toBe('Auth Service');
    });

    it('should parse data stores', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  datastore users_db "User Database"
`
      );
      expect(result.datastores).toHaveLength(1);
      expect(result.datastores[0].id).toBe('users_db');
      expect(result.datastores[0].label).toBe('User Database');
    });
  });

  describe('flows', () => {
    it('should parse data flows', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "User"
  process web "Web Server"
  user -- "HTTP request" --> web
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].source).toBe('user');
      expect(result.flows[0].target).toBe('web');
      expect(result.flows[0].label).toBe('HTTP request');
    });

    it('should parse flows with explicit IDs', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "User"
  process web "Web Server"
  f1: user -- "request" --> web
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].flowId).toBe('f1');
      expect(result.flows[0].source).toBe('user');
    });

    it('should parse flows with triple-quote description', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "User"
  process web "Web Server"
  user -- "request" --> web
    """
      Sends login credentials over HTTPS.
      Includes CSRF token in header.
    """
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].description).toContain('Sends login credentials');
      expect(result.flows[0].description).toContain('CSRF token');
    });

    it('should parse flows without description (backwards compat)', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "User"
  process web "Web Server"
  user -- "request" --> web
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].description).toBeUndefined();
    });
  });

  describe('boundaries', () => {
    it('should parse trust boundaries', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  boundary web_tier "Web Tier" {
    process web "Web Server"
    process api "API"
  }
`
      );
      expect(result.boundaries).toHaveLength(1);
      expect(result.boundaries[0].id).toBe('web_tier');
      expect(result.boundaries[0].label).toBe('Web Tier');
      expect(result.boundaries[0].processes).toHaveLength(2);
    });

    it('should parse nested boundaries', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  boundary outer "Outer" {
    process p1 "Process 1"
    boundary inner "Inner" {
      datastore db "Database"
    }
  }
`
      );
      expect(result.boundaries).toHaveLength(1);
      expect(result.boundaries[0].boundaries).toHaveLength(1);
      expect(result.boundaries[0].boundaries[0].id).toBe('inner');
      expect(result.boundaries[0].boundaries[0].datastores).toHaveLength(1);
    });
  });

  describe('threats', () => {
    it('should parse basic threat statements', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth"
  threat auth S "Spoofing attack"
`
      );
      expect(result.threats).toHaveLength(1);
      expect(result.threats[0].target).toBe('auth');
      expect(result.threats[0].category).toBe('S');
      expect(result.threats[0].description).toBe('Spoofing attack');
    });

    it('should parse threats with severity', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth"
  threat auth S "Spoofing" severity high
`
      );
      expect(result.threats[0].severity).toBe('high');
    });

    it('should parse threats with status', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth"
  threat auth T "Tampering" severity medium status mitigated
`
      );
      expect(result.threats[0].severity).toBe('medium');
      expect(result.threats[0].status).toBe('mitigated');
    });

    it('should parse threats with not-applicable status', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth"
  threat auth I "Info disclosure" status not-applicable
`
      );
      expect(result.threats[0].status).toBe('not-applicable');
    });

    it('should parse multiple STRIDE categories', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  process auth "Auth"
  threat auth S "Spoofing"
  threat auth T "Tampering"
  threat auth R "Repudiation"
  threat auth I "Info Disclosure"
  threat auth D "Denial of Service"
  threat auth E "Elevation of Privilege"
`
      );
      expect(result.threats).toHaveLength(6);
      expect(result.threats.map((t) => t.category)).toEqual(['S', 'T', 'R', 'I', 'D', 'E']);
    });
  });

  describe('direction', () => {
    it('should parse direction', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  direction LR
`
      );
      expect(result.directions).toHaveLength(1);
      expect(result.directions[0].direction).toBe('LR');
    });
  });

  describe('complete example', () => {
    it('should parse a complete DFD', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta showThreats
  title Payment System
  direction LR

  external customer "Customer"

  boundary api_zone "API Layer" {
    process gateway "API Gateway"
    process auth "Auth Service"
  }

  boundary services "Internal" {
    process payments "Payment Processor"
    boundary data_layer "Data" {
      datastore trans_db "Transaction DB"
    }
  }

  f1: customer -- "payment request" --> gateway
  gateway -- "auth token" --> auth
  auth -- "validated" --> payments
  payments -- "charge" --> trans_db

  threat customer S "Identity spoofing" severity high
  threat gateway D "DDoS" severity medium status investigate
  threat auth S "Token forgery" severity critical
  threat f1 T "MITM" severity high status mitigated
`
      );
      expect(result.showThreats).toBe(true);
      expect(result.title).toBe('Payment System');
      expect(result.directions[0].direction).toBe('LR');
      expect(result.externals).toHaveLength(1);
      expect(result.boundaries).toHaveLength(2);
      expect(result.boundaries[0].processes).toHaveLength(2);
      expect(result.boundaries[1].boundaries).toHaveLength(1);
      expect(result.flows).toHaveLength(4);
      expect(result.threats).toHaveLength(4);
    });
  });

  describe('autonumber', () => {
    it('should parse autonumber flag', async () => {
      const result = await parse('dfd', `dfd-beta autonumber\n`);
      expect(result.autonumber).toBe(true);
    });

    it('should parse autonumber with showThreats', async () => {
      const result = await parse('dfd', `dfd-beta showThreats autonumber\n`);
      expect(result.showThreats).toBe(true);
      expect(result.autonumber).toBe(true);
    });

    it('should default autonumber to false', async () => {
      const result = await parse('dfd', `dfd-beta\n`);
      expect(result.autonumber).toBe(false);
    });

    it('should parse flows with subflows', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta autonumber
  external user "User"
  process web "Web Server"
  process api "API"
  datastore db "Database"
  user -- "request" --> web {
    web -- "query" --> db
    web -- "call" --> api
  }
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].source).toBe('user');
      expect(result.flows[0].subflows).toHaveLength(2);
      expect(result.flows[0].subflows[0].source).toBe('web');
      expect(result.flows[0].subflows[0].target).toBe('db');
      expect(result.flows[0].subflows[1].source).toBe('web');
      expect(result.flows[0].subflows[1].target).toBe('api');
    });

    it('should parse nested subflows', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta autonumber
  external user "User"
  process web "Web Server"
  process api "API"
  datastore db "Database"
  user -- "login" --> web {
    web -- "validate" --> api {
      api -- "lookup" --> db
    }
  }
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].subflows).toHaveLength(1);
      expect(result.flows[0].subflows[0].subflows).toHaveLength(1);
      expect(result.flows[0].subflows[0].subflows[0].source).toBe('api');
      expect(result.flows[0].subflows[0].subflows[0].target).toBe('db');
    });

    it('should parse subflows with descriptions', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta autonumber
  external user "User"
  process web "Web Server"
  datastore db "Database"
  user -- "request" --> web
    """
      Main request flow
    """
    {
      web -- "query" --> db
    }
`
      );
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].description).toContain('Main request flow');
      expect(result.flows[0].subflows).toHaveLength(1);
    });

    it('should parse subflows without autonumber', async () => {
      const result = await parse(
        'dfd',
        `dfd-beta
  external user "User"
  process web "Web Server"
  datastore db "Database"
  user -- "request" --> web {
    web -- "query" --> db
  }
`
      );
      expect(result.autonumber).toBe(false);
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].subflows).toHaveLength(1);
    });
  });
});
