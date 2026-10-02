export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly detail: unknown;
  readonly url: string;

  constructor(
    message: string,
    options: {
      status: number;
      statusText: string;
      detail: unknown;
      url: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.detail = options.detail;
    this.url = options.url;
  }
}

const DEFAULT_BASE_URL = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  return DEFAULT_BASE_URL;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseErrorDetail(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function formatErrorMessage(status: number, detail: unknown): string {
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }

  if (
    detail &&
    typeof detail === "object" &&
    "detail" in detail &&
    (typeof (detail as { detail: unknown }).detail === "string" ||
      Array.isArray((detail as { detail: unknown }).detail))
  ) {
    const raw = (detail as { detail: string | unknown[] }).detail;
    if (typeof raw === "string") {
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .join("; ");
    }
  }

  return `Request failed with status ${status}`;
}

export function safeErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 422) {
      const detail = typeof error.detail === "string"
        ? error.detail.toLowerCase()
        : JSON.stringify(error.detail ?? "").toLowerCase();
      if (detail.includes("overlap")) return "Schedule slots overlap. Adjust the times and try again.";
      if (detail.includes("end") && detail.includes("start")) return "End time must be after start time.";
      if (detail.includes("shift rule") && detail.includes("not found")) return "The schedule changed. Reload it and try again.";
      return "Check the schedule details and try again.";
    }
    if (error.status === 401 || error.status === 403) return "Your session may have expired. Sign in again and retry.";
    if (error.status === 404) return "The requested item could not be found. Refresh and try again.";
    if (error.status >= 500) return "The service could not complete that request. Please try again shortly.";
    return fallback;
  }
  if (error instanceof Error && !/traceback|sqlalchemy|sqlite|select\s|insert\s|update\s|delete\s/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, headers = {}, signal } = options;
  const url = buildUrl(path, query);

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers: requestHeaders, body: requestBody, signal });
  } catch (error) {
    // Preserve cached/offline state and let callers decide whether to queue writes.
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiError(formatErrorMessage(response.status, detail), {
      status: response.status,
      statusText: response.statusText,
      detail,
      url,
    });
  }

  if (!isJson) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
