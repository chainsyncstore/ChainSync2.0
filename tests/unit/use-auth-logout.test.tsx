import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/hooks/use-auth';

vi.mock('@/lib/api-client', () => ({
  post: vi.fn(),
}));

const utilsMocks = vi.hoisted(() => ({
  saveSessionMock: vi.fn(),
  loadSessionMock: vi.fn(),
  clearSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  saveSession: utilsMocks.saveSessionMock,
  loadSession: utilsMocks.loadSessionMock,
  clearSession: utilsMocks.clearSessionMock,
  refreshSession: utilsMocks.refreshSessionMock,
  SESSION_STORAGE_KEY: 'chainsync_session',
  SESSION_DURATION: 8 * 60 * 60 * 1000,
}));

describe('useAuth logout behaviour', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let historyReplaceSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    utilsMocks.loadSessionMock.mockReturnValue(null);
    utilsMocks.saveSessionMock.mockReset();
    utilsMocks.clearSessionMock.mockReset();
    utilsMocks.refreshSessionMock.mockReset();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/logout')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }

      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({}),
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const locationMock: Location & { replace: ReturnType<typeof vi.fn> } = {
      ...(originalLocation as any),
      replace: vi.fn(),
      assign: vi.fn(),
      reload: vi.fn(),
      pathname: '/inventory',
      href: 'http://localhost/inventory',
    };

    Object.defineProperty(window, 'location', {
      value: locationMock,
      configurable: true,
      writable: true,
    });

    historyReplaceSpy = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    historyReplaceSpy.mockRestore();
    global.fetch = originalFetch;

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it('clears session and redirects to login via location.replace', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    utilsMocks.clearSessionMock.mockClear();
    (window.location as any).replace.mockClear();

    await act(async () => {
      await result.current.logout();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    expect(utilsMocks.clearSessionMock).toHaveBeenCalledTimes(2);
    expect((window.location as any).replace).toHaveBeenCalledWith('/login');
    expect(historyReplaceSpy).not.toHaveBeenCalled();
  });

  it('falls back to history.replaceState when already on login', async () => {
    (window.location as any).pathname = '/login';

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    utilsMocks.clearSessionMock.mockClear();
    (window.location as any).replace.mockClear();
    historyReplaceSpy.mockClear();

    await act(async () => {
      await result.current.logout();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    expect(utilsMocks.clearSessionMock).toHaveBeenCalledTimes(2);
    expect((window.location as any).replace).not.toHaveBeenCalled();
    expect(historyReplaceSpy).toHaveBeenCalledWith(null, '', '/login');
  });
});
