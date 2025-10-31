import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProtectedRouteGuard } from '@/hooks/use-protected-route-guard';

let currentPath = '/analytics';
const setLocationMock = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => [currentPath, setLocationMock],
}));

describe('useProtectedRouteGuard', () => {
  beforeEach(() => {
    currentPath = '/analytics';
    setLocationMock.mockClear();
  });

  it('redirects to login for protected routes when unauthenticated', () => {
    renderHook(() => useProtectedRouteGuard(false, false));
    expect(setLocationMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('does not redirect for public routes', () => {
    currentPath = '/login';
    renderHook(() => useProtectedRouteGuard(false, false));
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it('does not redirect while authentication state is loading', () => {
    renderHook(() => useProtectedRouteGuard(true, false));
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it('does not redirect when user is authenticated', () => {
    renderHook(() => useProtectedRouteGuard(false, true));
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it('strips query parameters before checking route access', () => {
    currentPath = '/inventory?tab=alerts';
    renderHook(() => useProtectedRouteGuard(false, false));
    expect(setLocationMock).toHaveBeenCalledWith('/login', { replace: true });
  });
});
