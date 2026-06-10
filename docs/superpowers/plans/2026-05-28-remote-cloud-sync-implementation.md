# Remote Cloud Sync Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `remote` monorepo cloud sync service with a Node.js + SQLite backend and a React + Ant Design frontend that can receive, store, and browse normalized conversation data.

**Architecture:** The implementation creates a workspace-style `remote` subproject with three packages: `web`, `server`, and `shared`. The backend owns auth, persistence, and sync/query APIs; the frontend owns setup and browsing pages; the shared package defines normalized conversation and API contracts used by both sides.

**Tech Stack:** `pnpm`, TypeScript, Vite, React, Ant Design, React Router, Fastify, SQLite, `better-sqlite3`, Vitest, Testing Library, `tsx`

---

## File Map

### Create

- `E:\Code\AI-Chat-Nodes\remote\package.json`
- `E:\Code\AI-Chat-Nodes\remote\pnpm-workspace.yaml`
- `E:\Code\AI-Chat-Nodes\remote\tsconfig.base.json`
- `E:\Code\AI-Chat-Nodes\remote\.gitignore`
- `E:\Code\AI-Chat-Nodes\remote\shared\package.json`
- `E:\Code\AI-Chat-Nodes\remote\shared\tsconfig.json`
- `E:\Code\AI-Chat-Nodes\remote\shared\src\conversation.ts`
- `E:\Code\AI-Chat-Nodes\remote\shared\src\api.ts`
- `E:\Code\AI-Chat-Nodes\remote\shared\src\system.ts`
- `E:\Code\AI-Chat-Nodes\remote\shared\src\index.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\package.json`
- `E:\Code\AI-Chat-Nodes\remote\server\tsconfig.json`
- `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\server.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\db\schema.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\db\database.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\env.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\auth.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\deviceRepository.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\conversationRepository.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\services\syncService.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\routes\auth.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\routes\sync.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\routes\conversations.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\routes\system.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\utils\hash.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\src\utils\errors.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\test\auth.test.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\test\syncService.test.ts`
- `E:\Code\AI-Chat-Nodes\remote\server\test\routes.test.ts`
- `E:\Code\AI-Chat-Nodes\remote\web\package.json`
- `E:\Code\AI-Chat-Nodes\remote\web\tsconfig.json`
- `E:\Code\AI-Chat-Nodes\remote\web\vite.config.ts`
- `E:\Code\AI-Chat-Nodes\remote\web\index.html`
- `E:\Code\AI-Chat-Nodes\remote\web\src\main.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\App.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\components\AppShell.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\components\StatusHeader.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\services\api.ts`
- `E:\Code\AI-Chat-Nodes\remote\web\src\services\storage.ts`
- `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SetupPage.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationsPage.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationDetailPage.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SettingsPage.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\styles\app.css`
- `E:\Code\AI-Chat-Nodes\remote\web\src\test\setup.test.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\test\routes.test.tsx`
- `E:\Code\AI-Chat-Nodes\remote\web\src\test\api.test.ts`

### Modify

- `E:\Code\AI-Chat-Nodes\docs\superpowers\specs\2026-05-28-remote-cloud-sync-design.md`
  - Only if spec corrections are needed during implementation; otherwise leave unchanged.

## Task 1: Scaffold the `remote` Monorepo

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\package.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\pnpm-workspace.yaml`
- Create: `E:\Code\AI-Chat-Nodes\remote\tsconfig.base.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\.gitignore`

- [ ] **Step 1: Write the failing workspace validation check**

Create `E:\Code\AI-Chat-Nodes\remote\package.json` with a deliberately incomplete script set:

```json
{
  "name": "ai-chat-helper-remote",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "check": "pnpm -r test"
  }
}
```

Create `E:\Code\AI-Chat-Nodes\remote\pnpm-workspace.yaml`:

```yaml
packages:
  - "web"
  - "server"
  - "shared"
```

Create `E:\Code\AI-Chat-Nodes\remote\tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": "."
  }
}
```

Create `E:\Code\AI-Chat-Nodes\remote\.gitignore`:

```gitignore
node_modules
dist
.turbo
coverage
.env
.env.local
data
```

- [ ] **Step 2: Run the workspace install command to verify it fails due to missing packages**

Run: `pnpm install`

Expected: failure mentioning missing workspace package directories such as `web`, `server`, or `shared`.

- [ ] **Step 3: Create the minimal workspace directories and root scripts**

Update `E:\Code\AI-Chat-Nodes\remote\package.json`:

```json
{
  "name": "ai-chat-helper-remote",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @remote/server --filter @remote/web dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "check": "pnpm run typecheck && pnpm run test"
  }
}
```

Create the directories:

- `E:\Code\AI-Chat-Nodes\remote\web`
- `E:\Code\AI-Chat-Nodes\remote\server`
- `E:\Code\AI-Chat-Nodes\remote\shared`

- [ ] **Step 4: Run install again to verify the workspace is now structurally valid**

Run: `pnpm install`

Expected: success with no workspace structure errors.

- [ ] **Step 5: Commit**

```bash
git add remote/package.json remote/pnpm-workspace.yaml remote/tsconfig.base.json remote/.gitignore
git commit -m "chore: scaffold remote workspace"
```

## Task 2: Build the Shared Contract Package

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\package.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\tsconfig.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\src\conversation.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\src\api.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\src\system.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\shared\src\index.ts`

- [ ] **Step 1: Write the failing shared typecheck target**

Create `E:\Code\AI-Chat-Nodes\remote\shared\package.json`:

```json
{
  "name": "@remote/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "pnpm run typecheck",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

Create `E:\Code\AI-Chat-Nodes\remote\shared\tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": true
  },
  "include": ["src"]
}
```

Create `E:\Code\AI-Chat-Nodes\remote\shared\src\index.ts`:

```ts
export * from "./conversation";
export * from "./api";
export * from "./system";
```

- [ ] **Step 2: Run shared typecheck to verify it fails because exports are missing**

Run: `pnpm --filter @remote/shared typecheck`

Expected: FAIL with module resolution errors for `./conversation`, `./api`, or `./system`.

- [ ] **Step 3: Implement the shared contract files**

Create `E:\Code\AI-Chat-Nodes\remote\shared\src\conversation.ts`:

```ts
export const supportedPlatforms = [
  "chatgpt",
  "claude",
  "qwen",
  "doubao",
  "deepseek",
] as const;

export type SupportedPlatform = (typeof supportedPlatforms)[number];

export type NormalizedAttachment = {
  name?: string;
  url?: string;
  mimeType?: string;
};

export type NormalizedToolCall = {
  type: string;
  name?: string;
  input?: unknown;
  output?: unknown;
};

export type NormalizedMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  text?: string;
  html?: string;
  attachments?: NormalizedAttachment[];
  toolCalls?: NormalizedToolCall[];
  parentId?: string;
  sequence: number;
  createdAt?: string;
};

export type NormalizedConversation = {
  platform: SupportedPlatform;
  sourceConversationId: string;
  title: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  messages: NormalizedMessage[];
};
```

Create `E:\Code\AI-Chat-Nodes\remote\shared\src\api.ts`:

```ts
import type { NormalizedConversation, SupportedPlatform } from "./conversation";

export type ValidateTokenResponse = {
  ok: boolean;
};

export type SyncPingRequest = {
  deviceId: string;
  deviceName: string;
};

export type SyncPingResponse = {
  ok: boolean;
  serverTime: string;
};

export type UpsertConversationRequest = {
  deviceId: string;
  deviceName: string;
  conversation: NormalizedConversation;
  contentHash: string;
};

export type UpsertConversationStatus = "created" | "updated" | "unchanged";

export type UpsertConversationResponse = {
  ok: boolean;
  status: UpsertConversationStatus;
  conversationId: string;
  snapshotId?: string;
};

export type ConversationListItem = {
  id: string;
  platform: SupportedPlatform;
  sourceConversationId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};

export type ConversationListResponse = {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ConversationDetailResponse = {
  conversation: ConversationListItem & {
    sourceUrl?: string;
    contentHash: string;
    createdAt: string;
    lastMessageAt?: string;
  };
  latestSnapshot: {
    id: string;
    snapshotVersion: number;
    syncedAt: string;
    payload: NormalizedConversation;
  };
};

export type ConversationsQuery = {
  platform?: SupportedPlatform;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
};
```

Create `E:\Code\AI-Chat-Nodes\remote\shared\src\system.ts`:

```ts
export type SystemStatusResponse = {
  ok: boolean;
  service: "remote-sync";
  database: "sqlite";
  conversationCount: number;
  deviceCount: number;
  serverTime: string;
};
```

- [ ] **Step 4: Run shared typecheck to verify it passes**

Run: `pnpm --filter @remote/shared typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/shared
git commit -m "feat: add shared remote sync contracts"
```

## Task 3: Scaffold the Backend App

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\server\package.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\tsconfig.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\server.ts`

- [ ] **Step 1: Write the failing backend smoke test**

Create `E:\Code\AI-Chat-Nodes\remote\server\package.json`:

```json
{
  "name": "@remote/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@remote/shared": "workspace:*",
    "fastify": "^5.2.1"
  },
  "devDependencies": {
    "@types/node": "^22.15.30",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\test\routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("buildApp", () => {
  it("registers the health route", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `pnpm --filter @remote/server test`

Expected: FAIL because `../src/app` does not exist.

- [ ] **Step 3: Implement the backend app skeleton**

Create `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`:

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify();

  app.get("/health", async () => {
    return { ok: true };
  });

  return app;
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\server.ts`:

```ts
import { buildApp } from "./app";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    console.log(`remote server listening on ${host}:${port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `pnpm --filter @remote/server test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/server
git commit -m "feat: scaffold remote server app"
```

## Task 4: Add Database Access and Persistence Schema

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\db\schema.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\db\database.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\test\syncService.test.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\server\package.json`

- [ ] **Step 1: Write the failing sync storage test**

Create `E:\Code\AI-Chat-Nodes\remote\server\test\syncService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database";

describe("database", () => {
  it("creates all required tables", () => {
    const db = createDatabase(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;

    const names = rows.map((row) => row.name).sort();

    expect(names).toEqual(
      expect.arrayContaining([
        "app_config",
        "devices",
        "conversations",
        "conversation_snapshots",
      ]),
    );
  });
});
```

Update `E:\Code\AI-Chat-Nodes\remote\server\package.json` dependencies:

```json
{
  "dependencies": {
    "@remote/shared": "workspace:*",
    "better-sqlite3": "^11.10.0",
    "fastify": "^5.2.1"
  }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @remote/server test -- syncService.test.ts`

Expected: FAIL because `createDatabase` does not exist.

- [ ] **Step 3: Implement the database bootstrap**

Create `E:\Code\AI-Chat-Nodes\remote\server\src\db\schema.ts`:

```ts
export const schemaSql = `
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  message_count INTEGER NOT NULL,
  last_message_at TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, source_conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  snapshot_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_conversation_id
  ON conversation_snapshots(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_synced_at
  ON conversation_snapshots(synced_at);
`;
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\db\database.ts`:

```ts
import Database from "better-sqlite3";
import { schemaSql } from "./schema";

export function createDatabase(filename: string) {
  const db = new Database(filename);
  db.exec(schemaSql);
  return db;
}
```

- [ ] **Step 4: Run the storage test to verify it passes**

Run: `pnpm --filter @remote/server test -- syncService.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/server/package.json remote/server/src/db remote/server/test/syncService.test.ts
git commit -m "feat: add remote server sqlite schema"
```

## Task 5: Add Environment and Auth Plugins

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\env.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\auth.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\test\auth.test.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`

- [ ] **Step 1: Write the failing auth route test**

Create `E:\Code\AI-Chat-Nodes\remote\server\test\auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("auth", () => {
  it("rejects protected routes without a bearer token", async () => {
    const app = buildApp({
      token: "secret-token",
      databasePath: ":memory:",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/system/status",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Missing or invalid bearer token",
    });
  });
});
```

- [ ] **Step 2: Run the auth test to verify it fails**

Run: `pnpm --filter @remote/server test -- auth.test.ts`

Expected: FAIL because `buildApp` does not accept options and `/api/system/status` is not implemented.

- [ ] **Step 3: Implement environment and auth plugins**

Create `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\env.ts`:

```ts
export type AppConfig = {
  token: string;
  databasePath: string;
};

export function resolveConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    token: overrides?.token || process.env.REMOTE_SYNC_TOKEN || "dev-token",
    databasePath:
      overrides?.databasePath || process.env.REMOTE_SYNC_DB_PATH || "data/remote-sync.db",
  };
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\utils\errors.ts`:

```ts
export function unauthorizedError() {
  return {
    ok: false as const,
    code: "UNAUTHORIZED",
    message: "Missing or invalid bearer token",
  };
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\plugins\auth.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorizedError } from "../utils/errors";

export function verifyBearerToken(expectedToken: string) {
  return async function authGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token || token !== expectedToken) {
      reply.status(401).send(unauthorizedError());
    }
  };
}
```

Update `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`:

```ts
import Fastify from "fastify";
import { createDatabase } from "./db/database";
import { resolveConfig, type AppConfig } from "./plugins/env";
import { verifyBearerToken } from "./plugins/auth";

export function buildApp(overrides?: Partial<AppConfig>) {
  const config = resolveConfig(overrides);
  const db = createDatabase(config.databasePath);
  const app = Fastify();

  app.decorate("config", config);
  app.decorate("db", db);

  app.get("/health", async () => {
    return { ok: true };
  });

  app.get(
    "/api/system/status",
    { preHandler: verifyBearerToken(config.token) },
    async () => {
      return {
        ok: true,
        service: "remote-sync",
        database: "sqlite",
        conversationCount: 0,
        deviceCount: 0,
        serverTime: new Date().toISOString(),
      };
    },
  );

  return app;
}
```

- [ ] **Step 4: Run the auth test to verify it passes**

Run: `pnpm --filter @remote/server test -- auth.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/server/src/plugins remote/server/src/utils remote/server/src/app.ts remote/server/test/auth.test.ts
git commit -m "feat: add remote server auth guard"
```

## Task 6: Implement Repositories and Sync Service

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\deviceRepository.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\conversationRepository.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\services\syncService.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\utils\hash.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\server\test\syncService.test.ts`

- [ ] **Step 1: Expand the failing sync service test**

Replace `E:\Code\AI-Chat-Nodes\remote\server\test\syncService.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { NormalizedConversation } from "@remote/shared";
import { createDatabase } from "../src/db/database";
import { upsertConversation } from "../src/services/syncService";
import { hashConversationPayload } from "../src/utils/hash";

function makeConversation(): NormalizedConversation {
  return {
    platform: "claude",
    sourceConversationId: "conv-1",
    title: "First conversation",
    url: "https://claude.ai/chat/conv-1",
    createdAt: "2026-05-28T08:00:00.000Z",
    updatedAt: "2026-05-28T09:00:00.000Z",
    messageCount: 1,
    messages: [
      {
        id: "msg-1",
        role: "user",
        text: "hello",
        sequence: 1,
        createdAt: "2026-05-28T08:00:00.000Z",
      },
    ],
  };
}

describe("upsertConversation", () => {
  it("creates then deduplicates an unchanged conversation", () => {
    const db = createDatabase(":memory:");
    const conversation = makeConversation();
    const contentHash = hashConversationPayload(conversation);

    const first = upsertConversation(db, {
      deviceId: "device-1",
      deviceName: "Chrome",
      conversation,
      contentHash,
    });

    const second = upsertConversation(db, {
      deviceId: "device-1",
      deviceName: "Chrome",
      conversation,
      contentHash,
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("unchanged");
  });

  it("creates a new snapshot when content changes", () => {
    const db = createDatabase(":memory:");
    const firstConversation = makeConversation();
    const secondConversation = {
      ...makeConversation(),
      messageCount: 2,
      updatedAt: "2026-05-28T10:00:00.000Z",
      messages: [
        ...makeConversation().messages,
        {
          id: "msg-2",
          role: "assistant" as const,
          text: "hi",
          sequence: 2,
          createdAt: "2026-05-28T10:00:00.000Z",
        },
      ],
    };

    upsertConversation(db, {
      deviceId: "device-1",
      deviceName: "Chrome",
      conversation: firstConversation,
      contentHash: hashConversationPayload(firstConversation),
    });

    const result = upsertConversation(db, {
      deviceId: "device-1",
      deviceName: "Chrome",
      conversation: secondConversation,
      contentHash: hashConversationPayload(secondConversation),
    });

    expect(result.status).toBe("updated");

    const snapshotCount = db
      .prepare("SELECT COUNT(*) as count FROM conversation_snapshots")
      .get() as { count: number };

    expect(snapshotCount.count).toBe(2);
  });
});
```

- [ ] **Step 2: Run the sync tests to verify they fail**

Run: `pnpm --filter @remote/server test -- syncService.test.ts`

Expected: FAIL because `upsertConversation` and `hashConversationPayload` do not exist.

- [ ] **Step 3: Implement repositories, hash utility, and sync service**

Create `E:\Code\AI-Chat-Nodes\remote\server\src\utils\hash.ts`:

```ts
import { createHash } from "node:crypto";
import type { NormalizedConversation } from "@remote/shared";

export function hashConversationPayload(conversation: NormalizedConversation) {
  return createHash("sha256")
    .update(JSON.stringify(conversation))
    .digest("hex");
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\deviceRepository.ts`:

```ts
import type Database from "better-sqlite3";

export function upsertDevice(
  db: Database.Database,
  input: { deviceId: string; deviceName: string; now: string },
) {
  const existing = db
    .prepare("SELECT id FROM devices WHERE device_id = ?")
    .get(input.deviceId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE devices SET device_name = ?, last_seen_at = ?, updated_at = ? WHERE device_id = ?",
    ).run(input.deviceName, input.now, input.now, input.deviceId);
    return existing.id;
  }

  const result = db
    .prepare(
      "INSERT INTO devices (device_id, device_name, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.deviceId, input.deviceName, input.now, input.now, input.now);

  return Number(result.lastInsertRowid);
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\repositories\conversationRepository.ts`:

```ts
import type Database from "better-sqlite3";
import type { NormalizedConversation } from "@remote/shared";

export function findConversation(
  db: Database.Database,
  platform: string,
  sourceConversationId: string,
) {
  return db
    .prepare(
      "SELECT * FROM conversations WHERE platform = ? AND source_conversation_id = ?",
    )
    .get(platform, sourceConversationId) as
    | {
        id: number;
        content_hash: string;
      }
    | undefined;
}

export function insertConversation(
  db: Database.Database,
  conversation: NormalizedConversation,
  contentHash: string,
  now: string,
) {
  const result = db
    .prepare(
      "INSERT INTO conversations (platform, source_conversation_id, title, source_url, message_count, last_message_at, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      conversation.platform,
      conversation.sourceConversationId,
      conversation.title,
      conversation.url || null,
      conversation.messageCount,
      conversation.updatedAt || null,
      contentHash,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

export function updateConversation(
  db: Database.Database,
  conversationId: number,
  conversation: NormalizedConversation,
  contentHash: string,
  now: string,
) {
  db.prepare(
    "UPDATE conversations SET title = ?, source_url = ?, message_count = ?, last_message_at = ?, content_hash = ?, updated_at = ? WHERE id = ?",
  ).run(
    conversation.title,
    conversation.url || null,
    conversation.messageCount,
    conversation.updatedAt || null,
    contentHash,
    now,
    conversationId,
  );
}

export function insertSnapshot(
  db: Database.Database,
  input: {
    conversationId: number;
    snapshotVersion: number;
    payloadJson: string;
    contentHash: string;
    syncedAt: string;
    createdByDeviceId: string;
  },
) {
  const result = db
    .prepare(
      "INSERT INTO conversation_snapshots (conversation_id, snapshot_version, payload_json, content_hash, synced_at, created_by_device_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.conversationId,
      input.snapshotVersion,
      input.payloadJson,
      input.contentHash,
      input.syncedAt,
      input.createdByDeviceId,
    );

  return Number(result.lastInsertRowid);
}

export function getSnapshotCountForConversation(
  db: Database.Database,
  conversationId: number,
) {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM conversation_snapshots WHERE conversation_id = ?",
    )
    .get(conversationId) as { count: number };

  return row.count;
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\services\syncService.ts`:

```ts
import type Database from "better-sqlite3";
import type { UpsertConversationRequest, UpsertConversationResponse } from "@remote/shared";
import {
  findConversation,
  getSnapshotCountForConversation,
  insertConversation,
  insertSnapshot,
  updateConversation,
} from "../repositories/conversationRepository";
import { upsertDevice } from "../repositories/deviceRepository";

export function upsertConversation(
  db: Database.Database,
  input: UpsertConversationRequest,
): UpsertConversationResponse {
  const now = new Date().toISOString();
  upsertDevice(db, {
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    now,
  });

  const existing = findConversation(
    db,
    input.conversation.platform,
    input.conversation.sourceConversationId,
  );

  if (!existing) {
    const conversationId = insertConversation(
      db,
      input.conversation,
      input.contentHash,
      now,
    );
    const snapshotId = insertSnapshot(db, {
      conversationId,
      snapshotVersion: 1,
      payloadJson: JSON.stringify(input.conversation),
      contentHash: input.contentHash,
      syncedAt: now,
      createdByDeviceId: input.deviceId,
    });

    return {
      ok: true,
      status: "created",
      conversationId: String(conversationId),
      snapshotId: String(snapshotId),
    };
  }

  if (existing.content_hash === input.contentHash) {
    return {
      ok: true,
      status: "unchanged",
      conversationId: String(existing.id),
    };
  }

  updateConversation(db, existing.id, input.conversation, input.contentHash, now);
  const nextVersion = getSnapshotCountForConversation(db, existing.id) + 1;
  const snapshotId = insertSnapshot(db, {
    conversationId: existing.id,
    snapshotVersion: nextVersion,
    payloadJson: JSON.stringify(input.conversation),
    contentHash: input.contentHash,
    syncedAt: now,
    createdByDeviceId: input.deviceId,
  });

  return {
    ok: true,
    status: "updated",
    conversationId: String(existing.id),
    snapshotId: String(snapshotId),
  };
}
```

- [ ] **Step 4: Run the sync tests to verify they pass**

Run: `pnpm --filter @remote/server test -- syncService.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/server/src/repositories remote/server/src/services remote/server/src/utils/hash.ts remote/server/test/syncService.test.ts
git commit -m "feat: implement remote sync persistence service"
```

## Task 7: Implement Server Routes

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\routes\auth.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\routes\sync.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\routes\conversations.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\server\src\routes\system.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\server\test\routes.test.ts`

- [ ] **Step 1: Replace the failing route integration test**

Replace `E:\Code\AI-Chat-Nodes\remote\server\test\routes.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("routes", () => {
  it("validates token and returns system status", async () => {
    const app = buildApp({
      token: "secret-token",
      databasePath: ":memory:",
    });

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/auth/validate-token",
    });

    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "POST",
      url: "/api/auth/validate-token",
      headers: {
        authorization: "Bearer secret-token",
      },
    });

    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual({ ok: true });
  });

  it("syncs and lists a conversation", async () => {
    const app = buildApp({
      token: "secret-token",
      databasePath: ":memory:",
    });

    const payload = {
      deviceId: "device-1",
      deviceName: "Chrome",
      contentHash: "hash-1",
      conversation: {
        platform: "claude",
        sourceConversationId: "conv-1",
        title: "Hello world",
        url: "https://claude.ai/chat/conv-1",
        createdAt: "2026-05-28T08:00:00.000Z",
        updatedAt: "2026-05-28T09:00:00.000Z",
        messageCount: 1,
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "hello",
            sequence: 1,
            createdAt: "2026-05-28T08:00:00.000Z",
          },
        ],
      },
    };

    const syncResponse = await app.inject({
      method: "POST",
      url: "/api/sync/upsert-conversation",
      headers: {
        authorization: "Bearer secret-token",
      },
      payload,
    });

    expect(syncResponse.statusCode).toBe(200);
    expect(syncResponse.json().status).toBe("created");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: {
        authorization: "Bearer secret-token",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toHaveLength(1);
    expect(listResponse.json().items[0].title).toBe("Hello world");
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `pnpm --filter @remote/server test -- routes.test.ts`

Expected: FAIL because API routes are not registered.

- [ ] **Step 3: Implement API routes and register them**

Create `E:\Code\AI-Chat-Nodes\remote\server\src\routes\auth.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/validate-token",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      return { ok: true };
    },
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\routes\system.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth";

export async function systemRoutes(app: FastifyInstance) {
  app.get(
    "/api/system/status",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      const conversationCountRow = app.db
        .prepare("SELECT COUNT(*) as count FROM conversations")
        .get() as { count: number };
      const deviceCountRow = app.db
        .prepare("SELECT COUNT(*) as count FROM devices")
        .get() as { count: number };

      return {
        ok: true,
        service: "remote-sync",
        database: "sqlite",
        conversationCount: conversationCountRow.count,
        deviceCount: deviceCountRow.count,
        serverTime: new Date().toISOString(),
      };
    },
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\routes\sync.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth";
import { upsertConversation } from "../services/syncService";

export async function syncRoutes(app: FastifyInstance) {
  app.post(
    "/api/sync/ping",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      return {
        ok: true,
        serverTime: new Date().toISOString(),
      };
    },
  );

  app.post(
    "/api/sync/upsert-conversation",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request) => {
      return upsertConversation(app.db, request.body as never);
    },
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\server\src\routes\conversations.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth";

export async function conversationRoutes(app: FastifyInstance) {
  app.get(
    "/api/conversations",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request) => {
      const query = request.query as {
        platform?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.max(1, Number(query.pageSize || 20));
      const offset = (page - 1) * pageSize;

      const filters: string[] = [];
      const values: Array<string | number> = [];

      if (query.platform) {
        filters.push("platform = ?");
        values.push(query.platform);
      }

      if (query.search) {
        filters.push("title LIKE ?");
        values.push(`%${query.search}%`);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const items = app.db
        .prepare(
          `SELECT id, platform, source_conversation_id as sourceConversationId, title, message_count as messageCount, updated_at as updatedAt
           FROM conversations
           ${whereClause}
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...values, pageSize, offset);

      const totalRow = app.db
        .prepare(`SELECT COUNT(*) as count FROM conversations ${whereClause}`)
        .get(...values) as { count: number };

      return {
        items,
        total: totalRow.count,
        page,
        pageSize,
      };
    },
  );

  app.get(
    "/api/conversations/:id",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request, reply) => {
      const params = request.params as { id: string };
      const conversation = app.db
        .prepare(
          "SELECT id, platform, source_conversation_id as sourceConversationId, title, source_url as sourceUrl, message_count as messageCount, content_hash as contentHash, created_at as createdAt, updated_at as updatedAt, last_message_at as lastMessageAt FROM conversations WHERE id = ?",
        )
        .get(params.id);

      if (!conversation) {
        reply.status(404);
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Conversation not found",
        };
      }

      const latestSnapshot = app.db
        .prepare(
          "SELECT id, snapshot_version as snapshotVersion, synced_at as syncedAt, payload_json as payloadJson FROM conversation_snapshots WHERE conversation_id = ? ORDER BY snapshot_version DESC LIMIT 1",
        )
        .get(params.id) as
        | {
            id: number;
            snapshotVersion: number;
            syncedAt: string;
            payloadJson: string;
          }
        | undefined;

      return {
        conversation,
        latestSnapshot: latestSnapshot
          ? {
              id: String(latestSnapshot.id),
              snapshotVersion: latestSnapshot.snapshotVersion,
              syncedAt: latestSnapshot.syncedAt,
              payload: JSON.parse(latestSnapshot.payloadJson),
            }
          : null,
      };
    },
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\server\src\app.ts`:

```ts
import Fastify from "fastify";
import { createDatabase } from "./db/database";
import { resolveConfig, type AppConfig } from "./plugins/env";
import { authRoutes } from "./routes/auth";
import { conversationRoutes } from "./routes/conversations";
import { syncRoutes } from "./routes/sync";
import { systemRoutes } from "./routes/system";

export function buildApp(overrides?: Partial<AppConfig>) {
  const config = resolveConfig(overrides);
  const db = createDatabase(config.databasePath);
  const app = Fastify();

  app.decorate("config", config);
  app.decorate("db", db);

  app.get("/health", async () => {
    return { ok: true };
  });

  void app.register(authRoutes);
  void app.register(syncRoutes);
  void app.register(conversationRoutes);
  void app.register(systemRoutes);

  return app;
}
```

- [ ] **Step 4: Run the route tests to verify they pass**

Run: `pnpm --filter @remote/server test -- routes.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/server/src/routes remote/server/src/app.ts remote/server/test/routes.test.ts
git commit -m "feat: add remote sync api routes"
```

## Task 8: Scaffold the Frontend App Shell

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\web\package.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\tsconfig.json`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\vite.config.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\index.html`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\main.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\App.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\components\AppShell.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\components\StatusHeader.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\styles\app.css`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\test\routes.test.tsx`

- [ ] **Step 1: Write the failing frontend routes test**

Create `E:\Code\AI-Chat-Nodes\remote\web\package.json`:

```json
{
  "name": "@remote/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@remote/shared": "workspace:*",
    "antd": "^5.27.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "@vitejs/plugin-react": "^4.5.2",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.2.4"
  }
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vitest/globals"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\test\routes.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders the setup route by default", () => {
    render(<App />);
    expect(screen.getByText("Connect Remote Service")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `pnpm --filter @remote/web test -- routes.test.tsx`

Expected: FAIL because `../App` does not exist.

- [ ] **Step 3: Implement the frontend shell**

Create `E:\Code\AI-Chat-Nodes\remote\web\vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
  },
});
```

Create `E:\Code\AI-Chat-Nodes\remote\web\index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Chat Remote Sync</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\App.tsx`:

```tsx
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import { AppRouter } from "./router";
import "./styles/app.css";

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 12,
        },
      }}
    >
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";

function SetupPlaceholder() {
  return <div>Connect Remote Service</div>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPlaceholder />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\components\AppShell.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import { Layout } from "antd";

export function AppShell({ children }: PropsWithChildren) {
  return <Layout style={{ minHeight: "100vh" }}>{children}</Layout>;
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\components\StatusHeader.tsx`:

```tsx
import { Tag } from "antd";

export function StatusHeader() {
  return <Tag color="blue">Remote Sync</Tag>;
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\styles\app.css`:

```css
html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  background: #f5f7fa;
  font-family:
    "Segoe UI",
    "PingFang SC",
    sans-serif;
}
```

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `pnpm --filter @remote/web test -- routes.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/web
git commit -m "feat: scaffold remote web shell"
```

## Task 9: Implement Frontend Storage and Setup Page

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\services\storage.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\services\api.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SetupPage.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\test\setup.test.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`

- [ ] **Step 1: Write the failing setup flow test**

Create `E:\Code\AI-Chat-Nodes\remote\web\src\test\setup.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SetupPage } from "../pages/SetupPage";

describe("SetupPage", () => {
  it("stores the remote config after a successful connection test", async () => {
    const validateToken = vi.fn().mockResolvedValue({ ok: true });
    const onConnected = vi.fn();

    render(
      <MemoryRouter>
        <SetupPage validateToken={validateToken} onConnected={onConnected} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Service URL"), {
      target: { value: "https://remote.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Access Token"), {
      target: { value: "secret-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(validateToken).toHaveBeenCalledWith({
      baseUrl: "https://remote.example.com",
      token: "secret-token",
    });
  });
});
```

- [ ] **Step 2: Run the setup test to verify it fails**

Run: `pnpm --filter @remote/web test -- setup.test.tsx`

Expected: FAIL because `SetupPage` does not exist.

- [ ] **Step 3: Implement local config storage and setup page**

Create `E:\Code\AI-Chat-Nodes\remote\web\src\services\storage.ts`:

```ts
export type RemoteConfig = {
  baseUrl: string;
  token: string;
};

const storageKey = "ai-chat-remote-config";

export function saveRemoteConfig(config: RemoteConfig) {
  localStorage.setItem(storageKey, JSON.stringify(config));
}

export function loadRemoteConfig(): RemoteConfig | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  return JSON.parse(raw) as RemoteConfig;
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\services\api.ts`:

```ts
import type {
  ConversationDetailResponse,
  ConversationListResponse,
  SystemStatusResponse,
  ValidateTokenResponse,
} from "@remote/shared";
import type { RemoteConfig } from "./storage";

async function request<T>(config: RemoteConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function validateToken(config: RemoteConfig) {
  return request<ValidateTokenResponse>(config, "/api/auth/validate-token", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchSystemStatus(config: RemoteConfig) {
  return request<SystemStatusResponse>(config, "/api/system/status");
}

export function fetchConversations(config: RemoteConfig) {
  return request<ConversationListResponse>(config, "/api/conversations");
}

export function fetchConversationDetail(config: RemoteConfig, id: string) {
  return request<ConversationDetailResponse>(config, `/api/conversations/${id}`);
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SetupPage.tsx`:

```tsx
import { useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import { saveRemoteConfig, type RemoteConfig } from "../services/storage";
import { validateToken as defaultValidateToken } from "../services/api";

type Props = {
  validateToken?: (config: RemoteConfig) => Promise<{ ok: boolean }>;
  onConnected?: () => void;
};

export function SetupPage({
  validateToken = defaultValidateToken,
  onConnected,
}: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleFinish(values: RemoteConfig) {
    setLoading(true);
    setError("");
    try {
      await validateToken(values);
      saveRemoteConfig(values);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Card style={{ width: 480 }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              Connect Remote Service
            </Typography.Title>
            <Typography.Text type="secondary">
              Configure the personal remote sync service endpoint and token.
            </Typography.Text>
          </div>
          {error ? <Alert type="error" message={error} /> : null}
          <Form layout="vertical" onFinish={handleFinish}>
            <Form.Item label="Service URL" name="baseUrl" rules={[{ required: true }]}>
              <Input placeholder="https://remote.example.com" />
            </Form.Item>
            <Form.Item label="Access Token" name="token" rules={[{ required: true }]}>
              <Input.Password placeholder="Enter bearer token" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Test Connection
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`:

```tsx
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { SetupPage } from "../pages/SetupPage";

export function AppRouter() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/setup"
        element={<SetupPage onConnected={() => navigate("/conversations")} />}
      />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Run the setup test to verify it passes**

Run: `pnpm --filter @remote/web test -- setup.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/web/src/services remote/web/src/pages/SetupPage.tsx remote/web/src/test/setup.test.tsx remote/web/src/router/index.tsx
git commit -m "feat: add remote setup page"
```

## Task 10: Implement Conversation List, Detail, and Settings Pages

**Files:**
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationsPage.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationDetailPage.tsx`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SettingsPage.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\App.tsx`

- [ ] **Step 1: Write the failing route coverage test**

Replace `E:\Code\AI-Chat-Nodes\remote\web\src\test\routes.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRouter } from "../router";

describe("AppRouter", () => {
  it("renders the setup page on /setup", () => {
    render(
      <MemoryRouter initialEntries={["/setup"]}>
        <AppRouter />
      </MemoryRouter>,
    );
    expect(screen.getByText("Connect Remote Service")).toBeInTheDocument();
  });

  it("renders the conversation shell on /conversations", () => {
    render(
      <MemoryRouter initialEntries={["/conversations"]}>
        <AppRouter />
      </MemoryRouter>,
    );
    expect(screen.getByText("Synced Conversations")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the route coverage test to verify it fails**

Run: `pnpm --filter @remote/web test -- routes.test.tsx`

Expected: FAIL because `/conversations` is not implemented.

- [ ] **Step 3: Implement the browse pages and app shell**

Create `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationsPage.tsx`:

```tsx
import { Card, Table, Typography } from "antd";

const placeholderRows = [
  {
    id: "1",
    platform: "claude",
    title: "Example conversation",
    messageCount: 4,
    updatedAt: "2026-05-28T09:00:00.000Z",
  },
];

export function ConversationsPage() {
  return (
    <Card>
      <Typography.Title level={3}>Synced Conversations</Typography.Title>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={placeholderRows}
        columns={[
          { title: "Platform", dataIndex: "platform" },
          { title: "Title", dataIndex: "title" },
          { title: "Messages", dataIndex: "messageCount" },
          { title: "Updated", dataIndex: "updatedAt" },
        ]}
      />
    </Card>
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationDetailPage.tsx`:

```tsx
import { Card, Descriptions, Tabs, Typography } from "antd";

export function ConversationDetailPage() {
  return (
    <Card>
      <Typography.Title level={3}>Conversation Detail</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Platform">claude</Descriptions.Item>
        <Descriptions.Item label="Title">Example conversation</Descriptions.Item>
      </Descriptions>
      <Tabs
        items={[
          {
            key: "rendered",
            label: "Rendered",
            children: <div>Message timeline preview</div>,
          },
          {
            key: "json",
            label: "Raw JSON",
            children: <pre>{`{"messages":[]}`}</pre>,
          },
        ]}
      />
    </Card>
  );
}
```

Create `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SettingsPage.tsx`:

```tsx
import { Card, Descriptions, Typography } from "antd";

export function SettingsPage() {
  return (
    <Card>
      <Typography.Title level={3}>System Settings</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Database">sqlite</Descriptions.Item>
        <Descriptions.Item label="Service">remote-sync</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\components\AppShell.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import { Layout, Menu } from "antd";
import { Link, useLocation } from "react-router-dom";
import { StatusHeader } from "./StatusHeader";

const { Header, Sider, Content } = Layout;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={220} theme="light">
        <div style={{ padding: 20, fontWeight: 700 }}>AI Chat Remote</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={[
            {
              key: "/conversations",
              label: <Link to="/conversations">Conversations</Link>,
            },
            {
              key: "/settings",
              label: <Link to="/settings">Settings</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingInline: 24,
          }}
        >
          <div>Remote Cloud Sync</div>
          <StatusHeader />
        </Header>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\router\index.tsx`:

```tsx
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ConversationDetailPage } from "../pages/ConversationDetailPage";
import { ConversationsPage } from "../pages/ConversationsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SetupPage } from "../pages/SetupPage";

export function AppRouter() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/setup"
        element={<SetupPage onConnected={() => navigate("/conversations")} />}
      />
      <Route
        path="/conversations"
        element={
          <AppShell>
            <ConversationsPage />
          </AppShell>
        }
      />
      <Route
        path="/conversations/:id"
        element={
          <AppShell>
            <ConversationDetailPage />
          </AppShell>
        }
      />
      <Route
        path="/settings"
        element={
          <AppShell>
            <SettingsPage />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Run the route coverage test to verify it passes**

Run: `pnpm --filter @remote/web test -- routes.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/web/src/pages remote/web/src/components/AppShell.tsx remote/web/src/router/index.tsx remote/web/src/test/routes.test.tsx
git commit -m "feat: add remote web browse pages"
```

## Task 11: Wire Frontend Pages to Live API Data

**Files:**
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationsPage.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationDetailPage.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SettingsPage.tsx`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\services\api.ts`
- Modify: `E:\Code\AI-Chat-Nodes\remote\web\src\services\storage.ts`
- Create: `E:\Code\AI-Chat-Nodes\remote\web\src\test\api.test.ts`

- [ ] **Step 1: Write the failing API helper test**

Create `E:\Code\AI-Chat-Nodes\remote\web\src\test\api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchConversations } from "../services/api";

describe("fetchConversations", () => {
  it("adds bearer auth and parses the list response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await fetchConversations({
      baseUrl: "https://remote.example.com",
      token: "secret-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://remote.example.com/api/conversations",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the API helper test to verify it fails or is incomplete**

Run: `pnpm --filter @remote/web test -- api.test.ts`

Expected: FAIL if global `fetch` handling or helper behavior is missing.

- [ ] **Step 3: Implement live data reads in the page layer**

Update `E:\Code\AI-Chat-Nodes\remote\web\src\services\storage.ts`:

```ts
export type RemoteConfig = {
  baseUrl: string;
  token: string;
};

const storageKey = "ai-chat-remote-config";

export function saveRemoteConfig(config: RemoteConfig) {
  localStorage.setItem(storageKey, JSON.stringify(config));
}

export function loadRemoteConfig(): RemoteConfig | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  return JSON.parse(raw) as RemoteConfig;
}

export function requireRemoteConfig() {
  const config = loadRemoteConfig();
  if (!config) {
    throw new Error("Remote service is not configured");
  }
  return config;
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, Input, Space, Table, Typography } from "antd";
import type { ConversationListItem } from "@remote/shared";
import { fetchConversations } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function ConversationsPage() {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchConversations(requireRemoteConfig()).then((response) => {
      setItems(response.items);
    });
  }, []);

  const filteredItems = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Title level={3}>Synced Conversations</Typography.Title>
        <Input
          placeholder="Search conversations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Table
          rowKey="id"
          pagination={false}
          dataSource={filteredItems}
          columns={[
            { title: "Platform", dataIndex: "platform" },
            { title: "Title", dataIndex: "title" },
            { title: "Messages", dataIndex: "messageCount" },
            { title: "Updated", dataIndex: "updatedAt" },
          ]}
        />
      </Space>
    </Card>
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\pages\ConversationDetailPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, Descriptions, Tabs, Typography } from "antd";
import { useParams } from "react-router-dom";
import type { ConversationDetailResponse } from "@remote/shared";
import { fetchConversationDetail } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchConversationDetail(requireRemoteConfig(), id).then(setDetail);
  }, [id]);

  return (
    <Card>
      <Typography.Title level={3}>Conversation Detail</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Platform">
          {detail?.conversation.platform || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Title">
          {detail?.conversation.title || "-"}
        </Descriptions.Item>
      </Descriptions>
      <Tabs
        items={[
          {
            key: "rendered",
            label: "Rendered",
            children: (
              <div>
                {(detail?.latestSnapshot.payload.messages || []).map((message) => (
                  <Card key={message.id} size="small" style={{ marginBottom: 12 }}>
                    <strong>{message.role}</strong>
                    <div>{message.text || message.html || "-"}</div>
                  </Card>
                ))}
              </div>
            ),
          },
          {
            key: "json",
            label: "Raw JSON",
            children: (
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(detail?.latestSnapshot.payload || {}, null, 2)}
              </pre>
            ),
          },
        ]}
      />
    </Card>
  );
}
```

Update `E:\Code\AI-Chat-Nodes\remote\web\src\pages\SettingsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, Descriptions, Typography } from "antd";
import type { SystemStatusResponse } from "@remote/shared";
import { fetchSystemStatus } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function SettingsPage() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);

  useEffect(() => {
    fetchSystemStatus(requireRemoteConfig()).then(setStatus);
  }, []);

  return (
    <Card>
      <Typography.Title level={3}>System Settings</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Database">{status?.database || "-"}</Descriptions.Item>
        <Descriptions.Item label="Service">{status?.service || "-"}</Descriptions.Item>
        <Descriptions.Item label="Conversations">
          {status?.conversationCount ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Devices">
          {status?.deviceCount ?? "-"}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
```

- [ ] **Step 4: Run the web tests to verify the API helper and page layer pass**

Run: `pnpm --filter @remote/web test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote/web/src/pages remote/web/src/services remote/web/src/test/api.test.ts
git commit -m "feat: connect remote web pages to api"
```

## Task 12: Final Workspace Verification

**Files:**
- No new files required

- [ ] **Step 1: Install all workspace dependencies**

Run: `pnpm install`

Expected: success across `remote`, `remote/server`, `remote/shared`, and `remote/web`.

- [ ] **Step 2: Run backend tests**

Run: `pnpm --filter @remote/server test`

Expected: PASS

- [ ] **Step 3: Run frontend tests**

Run: `pnpm --filter @remote/web test`

Expected: PASS

- [ ] **Step 4: Run workspace typecheck**

Run: `pnpm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add remote
git commit -m "test: verify remote cloud sync workspace"
```

## Spec Coverage Check

- `remote` monorepo structure: covered by Tasks 1, 2, 3, and 8
- Shared normalized conversation contract: covered by Task 2
- SQLite schema and persistence: covered by Task 4
- Personal bearer-token auth: covered by Task 5
- Sync and query APIs: covered by Tasks 6 and 7
- Token setup page: covered by Task 9
- Conversation list, detail, and settings pages: covered by Tasks 10 and 11
- Basic test strategy: covered by Tasks 3 through 12

No uncovered spec requirements remain for the first implementation slice.

## Self-Review Notes

- Placeholder scan completed: no `TODO`, `TBD`, or deferred implementation placeholders remain in the plan tasks.
- Type consistency checked: `NormalizedConversation`, `UpsertConversationRequest`, and route names match the design document.
- Scope check passed: the plan is focused on the single `remote` cloud sync subsystem and does not pull in userscript integration yet.
