import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock toast to avoid UI side effects
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

// Use real module for types, but we'll import after setting globals
import type { ApiResponse } from '../../client/src/lib/api-client';

// Helper to reset fetch mock per test
const createFetchMock = () => {
  const mock = vi.fn<typeof fetch>();
  (globalThis as any).fetch = mock as unknown as typeof fetch;
  return mock;
};

// Ensure document.cookie exists in jsdom
const setCookie = (cookie: string) => {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: cookie,
    configurable: true,
  });
};

// Import after mocks
import { apiClient } from '../../client/src/lib/api-client';

describe('ApiClient CSRF behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCookie('');
  });

  it('uses CSRF token from cookie for non-GET requests', async () => {
    const fetchMock = createFetchMock();

    // Cookie already set by server earlier
    setCookie('csrf-token=cookie-token-123');

    // Mock the API endpoint response
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ status: 'success', data: { ok: true } } as ApiResponse<{ ok: boolean }>),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await apiClient.post<{ ok: boolean }>('/auth/test', { a: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call0 = fetchMock.mock.calls[0];
    const url = call0?.[0] as string;
    const init = call0?.[1] as RequestInit | undefined;
    expect(url).toBe('/api/auth/test');
    expect(init?.method).toBe('POST');
    // Should include X-CSRF-Token header from cookie
    expect((init?.headers as any)['X-CSRF-Token']).toBe('cookie-token-123');
  });

  it('fetches CSRF token when cookie missing and attaches header', async () => {
    const fetchMock = createFetchMock();

    // 1) First fetch to get CSRF token
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ csrfToken: 'fetched-token-xyz' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    // 2) Second fetch is the real request
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ status: 'success', data: { ok: true } } as ApiResponse<{ ok: boolean }>),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await apiClient.post<{ ok: boolean }>('/auth/test', { a: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call: CSRF token endpoint
    const call1 = fetchMock.mock.calls[0];
    const url1 = call1?.[0] as string;
    const init1 = call1?.[1] as RequestInit | undefined;
    expect(url1).toBe('/api/auth/csrf-token');
    expect(init1?.method).toBe('GET');

    // Second call: the intended request with header
    const call2 = fetchMock.mock.calls[1];
    const url2 = call2?.[0] as string;
    const init2 = call2?.[1] as RequestInit | undefined;
    expect(url2).toBe('/api/auth/test');
    expect(init2?.method).toBe('POST');
    expect((init2?.headers as any)['X-CSRF-Token']).toBe('fetched-token-xyz');
  });

  it('does not require CSRF token for GET requests', async () => {
    const fetchMock = createFetchMock();

    // Only one GET for the resource
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ status: 'success', data: { ok: true } } as ApiResponse<{ ok: boolean }>),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await apiClient.get<{ ok: boolean }>('/auth/me');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call?.[0] as string;
    const init = call?.[1] as RequestInit | undefined;
    expect(url).toBe('/api/auth/me');
    expect(init?.method).toBe('GET');
    expect((init?.headers as any)['X-CSRF-Token']).toBeUndefined();
  });
});
