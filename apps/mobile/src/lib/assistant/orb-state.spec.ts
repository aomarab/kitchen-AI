import { describe, expect, it } from 'vitest';
import { orbStateFor } from './orb-state';

describe('orbStateFor', () => {
  it('speaks whenever the transport says Mama is speaking', () => {
    expect(orbStateFor({ status: 'connecting', mode: 'text', speaking: true })).toBe('speaking');
    expect(orbStateFor({ status: 'ended', mode: 'voice', speaking: true })).toBe('speaking');
  });

  it('listens only for a live voice session', () => {
    expect(orbStateFor({ status: 'live', mode: 'voice', speaking: false })).toBe('listening');
    expect(orbStateFor({ status: 'live', mode: 'text', speaking: false })).toBe('idle');
    expect(orbStateFor({ status: 'live', mode: 'live', speaking: false })).toBe('idle');
  });

  it('idles while connecting or ended', () => {
    expect(orbStateFor({ status: 'connecting', mode: 'voice', speaking: false })).toBe('idle');
    expect(orbStateFor({ status: 'ended', mode: 'voice', speaking: false })).toBe('idle');
  });
});
