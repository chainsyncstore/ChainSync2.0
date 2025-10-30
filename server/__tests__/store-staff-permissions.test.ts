import { describe, it, expect } from 'vitest';
import { evaluateCreationPermission, evaluateDeletionPermission } from '../api/routes.store-staff';

describe('evaluateCreationPermission', () => {
  const admin = { id: 'admin-1', isAdmin: true, role: 'admin' };
  const manager = { id: 'manager-1', isAdmin: false, role: 'manager' };
  const cashier = { id: 'cashier-1', isAdmin: false, role: 'cashier' };

  it('allows admin to create any role', () => {
    const roles = ['manager', 'cashier'];
    for (const role of roles) {
      const result = evaluateCreationPermission(admin, role);
      expect(result.allowed).toBe(true);
    }
  });

  it('allows manager to create cashiers', () => {
    const result = evaluateCreationPermission(manager, 'cashier');
    expect(result.allowed).toBe(true);
  });

  it('prevents manager from creating managers', () => {
    const result = evaluateCreationPermission(manager, 'manager');
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it('prevents cashier from creating staff', () => {
    const result = evaluateCreationPermission(cashier, 'cashier');
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });
});

describe('evaluateDeletionPermission', () => {
  const admin = { id: 'admin-1', isAdmin: true, role: 'admin' };
  const manager = { id: 'manager-1', isAdmin: false, role: 'manager' };
  const cashier = { id: 'cashier-1', isAdmin: false, role: 'cashier' };

  const cashierStaff = { id: 'staff-1', role: 'cashier', isAdmin: false };
  const managerStaff = { id: 'staff-2', role: 'manager', isAdmin: false };
  const adminStaff = { id: 'admin-staff', role: 'admin', isAdmin: true };

  it('blocks deletion of admin accounts', () => {
    const result = evaluateDeletionPermission(admin, adminStaff, null);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(400);
  });

  it('allows admin to delete non-admin staff regardless of creator', () => {
    const result = evaluateDeletionPermission(admin, cashierStaff, null);
    expect(result.allowed).toBe(true);
  });

  it('allows manager to delete cashier they invited', () => {
    const result = evaluateDeletionPermission(manager, cashierStaff, manager.id);
    expect(result.allowed).toBe(true);
  });

  it('prevents manager from deleting cashier invited by someone else', () => {
    const result = evaluateDeletionPermission(manager, cashierStaff, 'other-inviter');
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it('prevents manager from deleting other managers', () => {
    const result = evaluateDeletionPermission(manager, managerStaff, manager.id);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it('prevents cashier from deleting anyone', () => {
    const result = evaluateDeletionPermission(cashier, cashierStaff, cashier.id);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });
});
