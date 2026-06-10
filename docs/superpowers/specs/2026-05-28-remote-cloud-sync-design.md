# Remote Cloud Sync Service Design

## Overview

This document defines the first beta implementation of a cloud sync service for `AIChat-Helper.user-beta.js`.

The service will live under `E:\Code\AI-Chat-Nodes\remote` and will be a single-repository, dual-application project:

- `remote/web`: React + Ant Design frontend
- `remote/server`: Node.js backend with SQLite
- `remote/shared`: shared types and contracts

The goal of this first version is to support a personal-use cloud service that receives normalized conversation data from the userscript and provides a minimal web UI to browse synced conversations.

## Scope

### In Scope

- Create a new `remote` subproject in the existing repository
- Use a monorepo-style structure with separate frontend and backend apps
- Build a minimal frontend with Ant Design
- Build backend sync APIs for personal use
- Use SQLite as the initial database
- Support automatic sync of normalized conversation JSON from the userscript
- Provide pages for token configuration, conversation list, conversation detail, and system settings
- Support device identification and last-seen tracking
- Store conversation snapshots to allow future history expansion

### Out of Scope

- Multi-user accounts
- Registration and password login
- File or attachment binary upload
- Object storage integration
- Public sharing
- Advanced analytics dashboards
- Fine-grained incremental diff sync
- Complex background job processing

## Goals and Non-Goals

### Goals

- Get a reliable end-to-end sync loop running quickly
- Keep the architecture simple enough for fast iteration
- Avoid coupling the web service to any single upstream AI platform format
- Leave room for later expansion into attachments, richer management pages, and stronger auth

### Non-Goals

- Solving every future sync need in the first release
- Building a general SaaS platform
- Designing for high concurrency or public traffic

## Recommended Architecture

The recommended architecture is a single repository with two applications and one shared package:

- `remote/web`
  - React
  - Vite
  - Ant Design
  - React Router
  - TanStack Query or a lightweight fetch wrapper
- `remote/server`
  - Node.js
  - Fastify preferred, Express acceptable
  - SQLite with a lightweight ORM or query builder
  - Token-based auth middleware
- `remote/shared`
  - TypeScript types for normalized conversations
  - API request and response types

This structure keeps the frontend and backend independent during development while preserving shared contracts to reduce drift.

## Why This Approach

Three implementation directions were considered:

1. Single-repository dual app with shared contracts
2. One backend app statically serving a built frontend
3. Next.js-style integrated full-stack application

Option 1 is recommended because it provides the best balance for this project:

- Fast to implement
- Easy to debug locally
- Clean boundary between UI and APIs
- Good fit for future expansion
- Lower migration cost later than a tightly coupled one-app approach

## Project Structure

Recommended structure:

```text
remote/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  web/
    package.json
    index.html
    src/
      main.tsx
      App.tsx
      router/
      pages/
      components/
      services/
      stores/
      styles/
  server/
    package.json
    src/
      app.ts
      server.ts
      routes/
      plugins/
      services/
      repositories/
      db/
      utils/
      types/
  shared/
    package.json
    src/
      conversation.ts
      api.ts
      system.ts
```

## Technology Choices

### Frontend

- React + TypeScript
- Vite
- Ant Design
- React Router
- A small API layer for server calls

Reasoning:

- Ant Design matches the requested UI direction
- Vite gives the fastest setup and iteration speed
- TypeScript helps keep the normalized schema aligned with the backend

### Backend

- Node.js + TypeScript
- Fastify preferred for clean plugin structure and validation support
- SQLite for first release persistence
- `better-sqlite3` or a small ORM such as Drizzle

Reasoning:

- Node.js aligns with the chosen stack
- Fastify is lightweight, fast, and structured enough for the service layer
- SQLite is ideal for a personal beta deployment and avoids database setup overhead

## Frontend Pages

The first version should include four pages only.

### 1. Token Configuration Page

Purpose:

- Let the user configure the remote service base URL
- Let the user enter a personal API token
- Provide a test-connection action

Behavior:

- Store base URL and token in browser local storage
- Call `POST /api/auth/validate-token`
- On success, route to the conversation list page
- On failure, show clear error feedback

### 2. Conversation List Page

Purpose:

- Show all synced conversations

Behavior:

- Table view with:
  - platform
  - title
  - message count
  - updated time
  - source conversation id
- Support title search
- Support platform filtering
- Click row to open detail page

### 3. Conversation Detail Page

Purpose:

- Inspect one synced normalized conversation

Behavior:

- Show conversation metadata
- Render a message timeline
- Allow switching between rendered message view and raw JSON view
- Show latest snapshot metadata

### 4. System Settings Page

Purpose:

- Show current server state and local frontend configuration summary

Behavior:

- Show server health
- Show database path or database label
- Show total conversation count
- Show total device count
- Show last sync timestamp if available

## Frontend Information Architecture

Suggested route layout:

- `/setup`
- `/conversations`
- `/conversations/:id`
- `/settings`

Suggested shell layout:

- Left navigation
- Top header with service status
- Main content area

Ant Design components likely to be used:

- `Layout`
- `Menu`
- `Card`
- `Table`
- `Form`
- `Input`
- `Button`
- `Tag`
- `Descriptions`
- `Tabs`
- `Alert`
- `Result`
- `Spin`

## Backend API Design

The API should remain intentionally small for the first version.

### Authentication

Auth model:

- Personal-use bearer token only
- Backend compares the provided token against configured server token state
- No user accounts in v1

Required header:

- `Authorization: Bearer <token>`

### API Endpoints

#### `POST /api/auth/validate-token`

Purpose:

- Validate that the configured token is accepted by the server

Request:

```json
{}
```

Response:

```json
{
  "ok": true
}
```

#### `POST /api/sync/ping`

Purpose:

- Lightweight connectivity and auth check for the userscript

Request:

```json
{
  "deviceId": "string",
  "deviceName": "string"
}
```

Response:

```json
{
  "ok": true,
  "serverTime": "2026-05-28T10:00:00.000Z"
}
```

#### `POST /api/sync/upsert-conversation`

Purpose:

- Create or update a normalized conversation

Request:

```json
{
  "deviceId": "tm-device-001",
  "deviceName": "Chrome-Tampermonkey",
  "conversation": {
    "platform": "claude",
    "sourceConversationId": "abc123",
    "title": "Example conversation",
    "url": "https://claude.ai/chat/abc123",
    "createdAt": "2026-05-28T08:00:00.000Z",
    "updatedAt": "2026-05-28T10:00:00.000Z",
    "messageCount": 10,
    "messages": []
  },
  "contentHash": "sha256-..."
}
```

Response statuses:

- `created`
- `updated`
- `unchanged`

Response:

```json
{
  "ok": true,
  "status": "updated",
  "conversationId": "uuid-or-internal-id",
  "snapshotId": "uuid-or-internal-id"
}
```

#### `GET /api/conversations`

Purpose:

- List stored conversations

Query params:

- `platform`
- `search`
- `page`
- `pageSize`

Response:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

#### `GET /api/conversations/:id`

Purpose:

- Fetch one conversation with the latest snapshot

Response:

```json
{
  "conversation": {},
  "latestSnapshot": {}
}
```

#### `GET /api/system/status`

Purpose:

- Return service status for the frontend settings page

Response:

```json
{
  "ok": true,
  "service": "remote-sync",
  "database": "sqlite",
  "conversationCount": 0,
  "deviceCount": 0,
  "serverTime": "2026-05-28T10:00:00.000Z"
}
```

## Normalized Conversation Contract

The service must not store only platform-specific raw shapes. The userscript should normalize upstream data into a shared structure before sync.

Recommended normalized conversation shape:

```ts
type NormalizedConversation = {
  platform: "chatgpt" | "claude" | "qwen" | "doubao" | "deepseek";
  sourceConversationId: string;
  title: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  messages: NormalizedMessage[];
};

type NormalizedMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  text?: string;
  html?: string;
  attachments?: Array<{
    name?: string;
    url?: string;
    mimeType?: string;
  }>;
  toolCalls?: Array<{
    type: string;
    name?: string;
    input?: unknown;
    output?: unknown;
  }>;
  parentId?: string;
  sequence: number;
  createdAt?: string;
};
```

## Database Design

The first release should use a compact schema with four core tables.

### `app_config`

Purpose:

- Persist server-level configuration

Suggested columns:

- `id`
- `config_key`
- `config_value`
- `created_at`
- `updated_at`

### `devices`

Purpose:

- Track script instances or browsers that talk to the service

Suggested columns:

- `id`
- `device_id`
- `device_name`
- `last_seen_at`
- `created_at`
- `updated_at`

Constraints:

- unique on `device_id`

### `conversations`

Purpose:

- Store the current summary for each logical conversation

Suggested columns:

- `id`
- `platform`
- `source_conversation_id`
- `title`
- `source_url`
- `message_count`
- `last_message_at`
- `content_hash`
- `created_at`
- `updated_at`

Constraints:

- unique on `platform + source_conversation_id`

### `conversation_snapshots`

Purpose:

- Store synced payload versions over time

Suggested columns:

- `id`
- `conversation_id`
- `snapshot_version`
- `payload_json`
- `content_hash`
- `synced_at`
- `created_by_device_id`

Indexes:

- index on `conversation_id`
- index on `synced_at`

## Sync Strategy

The first release should use whole-conversation upsert with hash-based deduplication.

### Client Behavior

- The userscript assembles the full normalized conversation payload
- It computes a content hash from the normalized JSON
- It calls `POST /api/sync/upsert-conversation`
- It includes device metadata on each request

### Server Behavior

- Validate token
- Validate request shape
- Upsert device record
- Find conversation by `platform + sourceConversationId`
- If conversation does not exist:
  - create conversation
  - create snapshot version 1
  - return `created`
- If conversation exists and `content_hash` matches:
  - update device last-seen
  - optionally refresh conversation metadata timestamps
  - return `unchanged`
- If conversation exists and `content_hash` differs:
  - update conversation summary
  - create a new snapshot version
  - return `updated`

### Why Not Full Incremental Diff First

Incremental sync was intentionally not chosen for v1 because:

- It complicates client state management
- It increases edge cases across multiple AI platforms
- It makes debugging much harder in the beta phase
- The current goal is reliability, not maximum transfer efficiency

## Error Handling

Expected server responses should distinguish:

- auth failure
- invalid payload
- not found
- internal persistence error

Recommended response shape:

```json
{
  "ok": false,
  "code": "INVALID_PAYLOAD",
  "message": "conversation.messages is required"
}
```

Frontend and userscript behavior:

- Show clear validation errors for setup/test calls
- Preserve the last failure summary locally
- Allow manual retry
- Do not silently swallow auth failures

## Security Model

Because this is a personal-use service, the first release should use a pragmatic but explicit security model.

- One personal bearer token
- Token stored in frontend local storage and userscript config
- Server compares against configured token or hashed token
- CORS restricted to configured origins where practical
- Rate limiting optional but recommended
- No anonymous read access

Security notes:

- The personal token should not be hardcoded into the repository
- The first run of the server should require configuring the token via environment variable or setup file
- If exposed on a public domain, HTTPS is required

## Deployment Model

The initial deployment model should be simple:

- One Node.js backend process
- SQLite database file on the server
- One built frontend hosted either:
  - by the backend as static assets, or
  - by a reverse proxy / static host

Recommended first deployment:

- Build frontend assets
- Serve them from the Node backend for deployment simplicity

This does not change the local repository structure, which should still stay as two applications.

## Development Workflow

Recommended local development flow:

- Run backend dev server on one port
- Run frontend dev server on another port
- Configure frontend dev proxy or base URL
- Keep shared API types imported from `remote/shared`

## Testing Strategy

### Backend

- Unit tests for auth middleware
- Unit tests for hash-based upsert decisions
- Integration tests for core sync routes
- Schema validation tests for normalized payloads

### Frontend

- Basic route rendering tests
- API service tests
- Critical form behavior tests for setup page

### End-to-End

- Manual verification of:
  - token validation
  - listing synced conversations
  - opening conversation details
  - service status page

## Implementation Order

Recommended build order:

1. Scaffold `remote` monorepo structure
2. Create shared TypeScript contracts
3. Build backend server skeleton
4. Add SQLite schema and repositories
5. Implement token auth and status route
6. Implement sync routes
7. Implement conversation query routes
8. Scaffold frontend shell with Ant Design layout
9. Implement setup page and token validation flow
10. Implement conversation list page
11. Implement conversation detail page
12. Implement system settings page
13. Add minimal tests
14. Connect userscript beta sync settings later in a separate implementation step

## Open Design Decisions Resolved

The following decisions were confirmed during brainstorming:

- The work targets `AIChat-Helper.user-beta.js`
- Sync target is full normalized conversation data, not export-driven upload
- The service is personal-use only in v1
- The repository location is `E:\Code\AI-Chat-Nodes\remote`
- The architecture is single-repository dual app
- The frontend must use Ant Design
- The initial page scope is minimal usable pages only
- The database is SQLite

## Risks

### Payload Size

Large conversations may produce big JSON snapshots. This is acceptable in beta but should be monitored.

### Cross-Platform Shape Drift

Normalized contracts reduce this risk, but the userscript adapters still need care.

### Token Storage

Client-side local storage is acceptable for personal use but should be treated as a temporary trust model.

### Snapshot Growth

Repeated updates could grow the SQLite file. A later retention policy may be needed.

## Future Extensions

Possible future upgrades after v1:

- Attachment metadata and binary file sync
- Snapshot history browser
- Manual re-sync or reprocess controls
- Device management page
- Sync log page
- PostgreSQL migration path
- Search indexing
- Full-text query

## Final Recommendation

Build the first cloud service as a `remote` monorepo with:

- `web`: React + Ant Design
- `server`: Node.js + Fastify
- `shared`: TypeScript contracts
- SQLite for storage
- personal bearer-token auth
- whole-conversation hash-based upsert sync

This is the shortest path to a usable beta while preserving clean boundaries for future expansion.
