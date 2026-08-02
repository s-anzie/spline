const API_BASE_URL = process.env.NEXT_PUBLIC_SPLINE_API_URL ?? "/api/backend";

type ApiErrorBody = { message?: string | string[]; error?: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const contentType = response.headers.get("content-type");
  const payload = contentType?.includes("application/json")
    ? await response.json() as unknown
    : await response.text();

  if (!response.ok) {
    const details = typeof payload === "object" && payload !== null ? payload as ApiErrorBody : undefined;
    const rawMessage = details?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(" · ")
      : rawMessage ?? (typeof payload === "string" ? payload : undefined) ?? `Erreur HTTP ${response.status}`;
    if (response.status === 401 && token && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("spline:unauthorized"));
    }
    throw new ApiError(message, response.status, details);
  }

  return payload as T;
}
