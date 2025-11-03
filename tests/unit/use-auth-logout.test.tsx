import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/hooks/use-auth';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  post: postMock,
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
    postMock.mockReset();
    postMock.mockResolvedValue({});

    fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
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

    expect(postMock).toHaveBeenCalledWith('/auth/logout');
    expect(utilsMocks.clearSessionMock).toHaveBeenCalledTimes(1);
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

    expect(postMock).toHaveBeenCalledWith('/auth/logout');
    expect(utilsMocks.clearSessionMock).toHaveBeenCalledTimes(1);
    expect((window.location as any).replace).not.toHaveBeenCalled();
    expect(historyReplaceSpy).toHaveBeenCalledWith(null, '', '/login');
  });
});
