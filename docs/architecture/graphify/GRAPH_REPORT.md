# Graph Report - server  (2026-09-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 73 nodes · 160 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bac0f7e3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8

## God Nodes (most connected - your core abstractions)
1. `handlePost()` - 14 edges
2. `badRequest()` - 11 edges
3. `normalizeForPublishing()` - 10 edges
4. `validateKnownInvitationFields()` - 9 edges
5. `createHandler()` - 7 edges
6. `sendError()` - 7 edges
7. `validateItem()` - 7 edges
8. `handleDelete()` - 6 edges
9. `handleGet()` - 6 edges
10. `optionalString()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `handlePost()` --indirect_call--> `createPublicId()`  [INFERRED]
  http.cjs → validation.cjs
- `handlePost()` --calls--> `normalizeForPublishing()`  [EXTRACTED]
  http.cjs → validation.cjs
- `handleDelete()` --calls--> `tokenHashFromHeader()`  [EXTRACTED]
  http.cjs → validation.cjs
- `handlePost()` --calls--> `sha256()`  [EXTRACTED]
  http.cjs → validation.cjs
- `handlePost()` --calls--> `tokenHashFromHeader()`  [EXTRACTED]
  http.cjs → validation.cjs

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.16
Nodes (12): booleanFromEnv(), DEFAULT_LIMITS, ERROR_MESSAGES, integerFromEnv(), readConfigFromEnv(), config, { createHandler }, { createMongoRepository } (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (10): {
  createPublicId,
  isValidPublicId,
  normalizeForPublishing,
  sha256,
  tokenHashFromHeader,
  validateIdempotencyKey
}, { DEFAULT_LIMITS, ERROR_MESSAGES }, fs, getRequestOrigin(), isAllowedOrigin(), MIME_TYPES, path, serveStatic() (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (9): calculateExpiresAt(), clientIpFrom(), handlePost(), mapRepositoryError(), readBody(), createPublicId(), sha256(), tokenHashFromHeader() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (9): createHandler(), empty(), errorBody(), handleDelete(), handleGet(), isExpired(), json(), sendError() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (8): bodyTooLarge(), { Buffer }, { createHash, randomInt }, { DEFAULT_LIMITS }, inspectJsonShape(), normalizeForPublishing(), { normalizeInvitation }, stableStringify()

### Community 5 - "Community 5"
Cohesion: 0.61
Nodes (8): badRequest(), optionalBooleanInput(), optionalString(), optionalStringOrNumber(), validateItem(), validateKnownInvitationFields(), validateStopFields(), validateStops()

### Community 6 - "Community 6"
Cohesion: 0.48
Nodes (6): counterExpiry(), createMongoRepository(), dayBucket(), errorWithCode(), hourBucket(), { MongoClient }

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (3): hasMagicBytes(), validateHeroImage(), validateImageDataUrl()

## Knowledge Gaps
- **18 isolated node(s):** `config`, `{ createHandler }`, `{ createMongoRepository }`, `http`, `path` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 19 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createMongoRepository()` connect `Community 6` to `Community 0`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `normalizeForPublishing()` connect `Community 4` to `Community 8`, `Community 1`, `Community 2`, `Community 5`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `handlePost()` connect `Community 2` to `Community 1`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `config`, `{ createHandler }`, `{ createMongoRepository }` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._