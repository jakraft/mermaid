import type { DiagramMetadata } from '../types.js';

export default {
  id: 'dfd',
  name: 'Data Flow Diagram',
  description: 'STRIDE threat modeling with data flow diagrams',
  examples: [
    {
      title: 'Simple Web App',
      isDefault: true,
      code: `dfd-beta
  title Simple Web App
  direction LR

  external user "Web User"

  boundary web_tier "Web Tier" {
    process web "Web Server"
    process api "API Service"
  }

  boundary data_tier "Data Tier" {
    datastore db "User Database"
  }

  user -- "HTTP request" --> web
  web -- "REST call" --> api
  api -- "SQL query" --> db
`,
    },
    {
      title: 'Threat Model with STRIDE',
      code: `dfd-beta showThreats
  title Payment System
  direction LR

  external customer "Customer"
  external bank "Payment Gateway"

  boundary app "Application" {
    process gateway "API Gateway"
    process payments "Payment Processor"
  }

  boundary storage "Data Layer" {
    datastore orders "Order Database"
  }

  f1: customer -- "payment request" --> gateway
  gateway -- "process payment" --> payments
  payments -- "charge" --> bank
  payments -- "store order" --> orders

  threat customer S "Identity spoofing" severity high status investigate
  threat gateway D "DDoS attack" severity high status mitigated
  threat f1 T "Man-in-the-middle" severity high status mitigated
  threat orders I "Data breach" severity critical status new
`,
    },
    {
      title: 'Auto-Numbered Flows',
      code: `dfd-beta autonumber
  title API Request Lifecycle
  direction LR

  external client "Client App"

  boundary backend "Backend" {
    process gw "API Gateway"
    process auth "Auth Service"
    process orders "Order Service"
    datastore db "Database"
  }

  client -- "API request" --> gw {
    gw -- "validate token" --> auth
  }
  gw -- "create order" --> orders {
    orders -- "persist" --> db
  }
  orders -- "confirmation" --> gw
  gw -- "response" --> client
`,
    },
  ],
} satisfies DiagramMetadata;
