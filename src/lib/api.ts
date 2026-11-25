// In-memory session token fallback for cross-origin iframe environments where third-party cookies may be blocked.
// Never persisted to localStorage or sessionStorage.
let inMemoryToken: string | null = null;

export function setSessionToken(token: string | null) {
  inMemoryToken = token;
}

export function clearSessionToken() {
  inMemoryToken = null;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T & { ok?: boolean; error?: string; message?: string };
}

export async function apiRequest<T = Record<string, unknown>>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
    signal?: AbortSignal;
  } = {}
): Promise<ApiResult<T>> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'X-Requested-With': 'NDH-CMS',
  };

  if (inMemoryToken) {
    headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const data = (await res.json().catch(() => ({}))) as T & {
      ok?: boolean;
      error?: string;
      message?: string;
    };

    return {
      ok: res.ok && data.ok !== false,
      status: res.status,
      data,
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      status: 0,
      data: { ok: false, error: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.' } as T & {
        ok?: boolean;
        error?: string;
        message?: string;
      },
    };
  }
}
