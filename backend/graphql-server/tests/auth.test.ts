import { describe, expect, it } from 'vitest';
import { tokensMatch } from '../src/auth.js';
import { loadConfig } from '../src/config.js';

describe('internal token auth', () => {
  it('accepts the exact token', () => {
    expect(tokensMatch('a-very-long-shared-token', 'a-very-long-shared-token')).toBe(true);
  });

  it('rejects missing or wrong tokens', () => {
    expect(tokensMatch(undefined, 'expected-token-value')).toBe(false);
    expect(tokensMatch('', 'expected-token-value')).toBe(false);
    expect(tokensMatch('expected-token-valuX', 'expected-token-value')).toBe(false);
  });
});

describe('config', () => {
  const base = { INTERNAL_API_TOKEN: 'x'.repeat(32), DB_HOST: 'h', DB_NAME: 'd', DB_USER: 'u' };

  it('defaults to IAM auth with TLS and no password', () => {
    const c = loadConfig(base);
    expect(c.db.authMode).toBe('iam');
    expect(c.db.ssl).toBe(true);
    expect(c.db.password).toBeUndefined();
    expect(c.introspection).toBe(false);
  });

  it('refuses to start without the internal token', () => {
    expect(() => loadConfig({ ...base, INTERNAL_API_TOKEN: '' })).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('requires a password only in password mode', () => {
    expect(() => loadConfig({ ...base, DB_AUTH_MODE: 'password' })).toThrow(/DB_PASSWORD/);
  });
});
