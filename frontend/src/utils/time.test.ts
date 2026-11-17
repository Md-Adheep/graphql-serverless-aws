import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

const now = Date.parse('2026-01-01T12:00:00Z');

describe('timeAgo', () => {
  it('formats recent, minute, hour and day ranges', () => {
    expect(timeAgo('2026-01-01T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-01-01T11:55:00Z', now)).toBe('5m ago');
    expect(timeAgo('2026-01-01T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2025-12-30T12:00:00Z', now)).toBe('2d ago');
  });

  it('never returns a negative value for clock skew', () => {
    expect(timeAgo('2026-01-01T12:00:30Z', now)).toBe('just now');
  });
});
