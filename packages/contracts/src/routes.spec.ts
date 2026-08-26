import { describe, expect, it } from 'vitest';
import { deleteMeRequestSchema, userSchema } from './auth.js';
import { routes } from './routes.js';
import { updateReminderSettingsRequestSchema } from './reminders.js';

describe('deleteMe route', () => {
  it('is authenticated but not household-scoped, so it works when the last household is gone', () => {
    expect(routes.deleteMe.method).toBe('DELETE');
    expect(routes.deleteMe.path).toBe('/me');
    expect(routes.deleteMe.auth).toBe(true);
    expect(routes.deleteMe.household).toBe(false);
  });

  it('accepts an omitted password, because OAuth-only accounts have none', () => {
    expect(deleteMeRequestSchema.parse({})).toEqual({});
    expect(deleteMeRequestSchema.parse({ password: 'hunter2' })).toEqual({ password: 'hunter2' });
    expect(deleteMeRequestSchema.safeParse({ password: '' }).success).toBe(false);
  });
});

describe('userSchema', () => {
  it('accepts hasPassword: true and round-trips it', () => {
    const parsed = userSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'chef@example.com',
      displayName: 'Amira',
      locale: 'en',
      hasPassword: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.hasPassword).toBe(true);
  });

  it('accepts hasPassword: false and round-trips it', () => {
    const parsed = userSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'chef@example.com',
      displayName: 'Amira',
      locale: 'en',
      hasPassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.hasPassword).toBe(false);
  });

  it('rejects missing hasPassword — field is required', () => {
    expect(() => {
      userSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'chef@example.com',
        displayName: 'Amira',
        locale: 'en',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    }).toThrow();
  });

  it('rejects non-boolean hasPassword — field must be a boolean', () => {
    expect(() => {
      userSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'chef@example.com',
        displayName: 'Amira',
        locale: 'en',
        hasPassword: 'true',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    }).toThrow();
  });
});

describe('reminder settings routes', () => {
  it('registers the read route as authenticated and household-scoped', () => {
    expect(routes.getReminderSettings).toMatchObject({
      method: 'GET',
      path: '/reminders/settings',
      auth: true,
      household: true,
    });
  });

  it('registers the update route with the partial-settings body', () => {
    expect(routes.updateReminderSettings).toMatchObject({
      method: 'PATCH',
      path: '/reminders/settings',
      auth: true,
      household: true,
    });
    expect(routes.updateReminderSettings.body).toBe(updateReminderSettingsRequestSchema);
  });
});
