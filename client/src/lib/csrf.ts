let cachedToken: string | null = null;
let lastFetchTime = 0;
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

async function requestCsrfToken(): Promise<string> {
  // Skip network request if offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline - cannot fetch CSRF token');
  }
  
  // Add timeout to prevent hanging when network is slow/down
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  let response: Response;
  try {
    response = await fetch('/api/auth/csrf-token', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token (status ${response.status})`);
  }

  const headerToken = response.headers.get('X-CSRF-Token');
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // empty body is acceptable
  }

  const token = headerToken || body?.token || body?.csrfToken;
  if (!token) {
    throw new Error('CSRF token missing from response');
  }

  return token;
}

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now - lastFetchTime < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const token = await requestCsrfToken();
  cachedToken = token;
  lastFetchTime = now;
  return token;
}

export function clearCsrfTokenCache(): void {
  cachedToken = null;
  lastFetchTime = 0;
}
