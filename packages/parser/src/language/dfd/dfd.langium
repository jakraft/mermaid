grammar DfdGrammar
import "../common/common";

entry Dfd:
  NEWLINE*
  "dfd-beta" showThreats?="showThreats"? autonumber?="autonumber"?
  (
    NEWLINE
    | TitleAndAccessibilities
    | Statement
  )*
;

fragment Statement:
    directions+=DirectionStatement
    | externals+=ExternalDecl
    | processes+=ProcessDecl
    | datastores+=DataStoreDecl
    | flows+=DataFlow
    | boundaries+=TrustBoundary
    | threats+=ThreatStatement
;

DirectionStatement:
  "direction" direction=DIRECTION_VALUE EOL
;

ExternalDecl:
  "external" id=ID label=STRING EOL
;

ProcessDecl:
  "process" id=ID label=STRING EOL
;

DataStoreDecl:
  "datastore" id=ID label=STRING EOL
;

TrustBoundary:
  "boundary" id=ID label=STRING "{"
    (
      NEWLINE
      | externals+=ExternalDecl
      | processes+=ProcessDecl
      | datastores+=DataStoreDecl
      | flows+=DataFlow
      | boundaries+=TrustBoundary
      | threats+=ThreatStatement
    )*
  "}"
;

DataFlow:
  (flowId=ID ":")? source=ID DFD_ARROW label=STRING DFD_ARROW_HEAD target=ID
  (
    "{" (NEWLINE | subflows+=DataFlow)* "}"
    | EOL (description=TRIPLE_QUOTE_STRING)? NEWLINE* ("{" (NEWLINE | subflows+=DataFlow)* "}")?
  )
;

ThreatStatement:
  "threat" target=ID category=STRIDE_CATEGORY description=STRING
    ("severity" severity=SEVERITY_LEVEL)?
    ("status" status=THREAT_STATUS)? EOL
;

terminal DIRECTION_VALUE: 'LR' | 'RL' | 'TB' | 'BT';
terminal STRIDE_CATEGORY: /[STRIDE]/;
terminal SEVERITY_LEVEL: 'low' | 'medium' | 'high' | 'critical';
terminal THREAT_STATUS: 'new' | 'investigate' | 'not-applicable' | 'mitigated';
terminal DFD_ARROW_HEAD: '-->';
terminal DFD_ARROW: '--';
terminal TRIPLE_QUOTE_STRING: /"""[\s\S]*?"""/;
