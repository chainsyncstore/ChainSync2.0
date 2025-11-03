import { beforeEach, describe, expect, it } from 'vitest';

import { DatabaseStorage } from '../../server/storage';

const storage = new DatabaseStorage();

describe('updateUser', () => {
  let userId: string;
  beforeEach(async () => {
    // Create a user for testing
    const user = await storage.createUser({
      username: 'testuser',
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: 'TestPass123!',
      phone: '1234567890',
      companyName: 'TestCo',
      location: 'TestCity',
      role: 'admin',
      isActive: true,
    } as any);
    userId = user.id;
  });

  it('should update user profile fields except password', async () => {
    const updated = await storage.updateUser(userId, {
      firstName: 'Updated',
      lastName: 'User',
      phone: '9876543210',
      companyName: 'UpdatedCo',
      location: 'NewCity',
    });
    expect(updated.firstName).toBe('Updated');
    expect(updated.phone).toBe('9876543210');
    expect(updated.companyName).toBe('UpdatedCo');
    expect(updated.location).toBe('NewCity');
  });

  it('should not allow updating email to an existing email', async () => {
    // Create another user
    await storage.createUser({
      username: 'otheruser',
      email: 'other@example.com',
      firstName: 'Other',
      lastName: 'User',
      password: 'OtherPass123!',
      role: 'admin',
      isActive: true,
    } as any);
    await expect(
      storage.updateUser(userId, { email: 'other@example.com' })
    ).rejects.toThrow('Email already in use');
  });

  it('should allow updating email if unique', async () => {
    const updated = await storage.updateUser(userId, { email: 'unique@example.com' });
    expect(updated.email).toBe('unique@example.com');
  });
});
