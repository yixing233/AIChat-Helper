import type {
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationsQuery,
  SystemStatusResponse,
  ValidateTokenResponse,
} from "@remote/shared";
import type { RemoteConfig } from "./storage";

type RequestOptions = {
  method?: string;
};

function getErrorMessage(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return "Remote service request failed";
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(config: RemoteConfig, path: string, query?: ConversationsQuery) {
  const url = new URL(`${normalizeBaseUrl(config.baseUrl)}${path}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function requestJson<T>(
  config: RemoteConfig,
  path: string,
  options: RequestOptions = {},
  query?: ConversationsQuery,
): Promise<T> {
  const response = await fetch(buildUrl(config, path, query), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.token}`,
    },
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(getErrorMessage(body));
  }

  return body as T;
}

export function validateToken(config: RemoteConfig) {
  return requestJson<ValidateTokenResponse>(config, "/api/auth/validate-token", {
    method: "POST",
  });
}

export function fetchSystemStatus(config: RemoteConfig) {
  return requestJson<SystemStatusResponse>(config, "/api/system/status");
}

export function fetchConversations(
  config: RemoteConfig,
  query?: ConversationsQuery,
) {
  return requestJson<ConversationListResponse>(
    config,
    "/api/conversations",
    {},
    query,
  );
}

export function fetchConversationDetail(config: RemoteConfig, id: string) {
  return requestJson<ConversationDetailResponse>(
    config,
    `/api/conversations/${encodeURIComponent(id)}`,
  );
}
