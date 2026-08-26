import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCsv, downloadCsv, CSV_BOM, REVOKE_DELAY_MS } from './csv';

const COLUMNS = [
  { header: 'id', value: (r: Row) => r.id },
  { header: 'message', value: (r: Row) => r.message },
] as const;

interface Row {
  id: string;
  message: string | null;
}

function body(rows: Row[]): string {
  return toCsv(rows, COLUMNS).slice(CSV_BOM.length);
}

describe('toCsv', () => {
  it('writes a header row followed by the values', () => {
    expect(body([{ id: '1', message: 'good' }])).toBe('id,message\r\n1,good');
  });

  it('quotes a value containing a comma, which would otherwise become two columns', () => {
    expect(body([{ id: '1', message: 'fast, and clear' }])).toBe('id,message\r\n1,"fast, and clear"');
  });

  it('doubles quotes inside a value, the only escape CSV has', () => {
    expect(body([{ id: '1', message: 'he said "no"' }])).toBe('id,message\r\n1,"he said ""no"""');
  });

  it('keeps a multi-line message in one field instead of inventing rows', () => {
    expect(body([{ id: '1', message: 'line one\nline two' }])).toBe('id,message\r\n1,"line one\nline two"');
  });

  it('writes an empty field for a missing value', () => {
    expect(body([{ id: '1', message: null }])).toBe('id,message\r\n1,');
  });

  it('defuses a value a spreadsheet would execute as a formula', () => {
    // Feedback is user-written, so it can start with =, +, - or @. Excel and
    // Sheets run those on open; the leading apostrophe makes them text again.
    expect(body([{ id: '1', message: '=1+1' }])).toBe("id,message\r\n1,'=1+1");
    expect(body([{ id: '1', message: '@SUM(A1)' }])).toBe("id,message\r\n1,'@SUM(A1)");
    expect(body([{ id: '1', message: '-2+3' }])).toBe("id,message\r\n1,'-2+3");
    expect(body([{ id: '1', message: '+1' }])).toBe("id,message\r\n1,'+1");
  });

  it('still quotes a defused value that also contains a comma', () => {
    expect(body([{ id: '1', message: '=1,2' }])).toBe("id,message\r\n1,\"'=1,2\"");
  });

  it('starts with a byte-order mark, or Excel renders Arabic as mojibake', () => {
    const csv = toCsv([{ id: '1', message: 'رائع' }], COLUMNS);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('رائع');
  });

  it('emits only a header when there is nothing to export', () => {
    expect(body([])).toBe('id,message');
  });
});

/**
 * These cover the one part of the download a jsdom test can actually observe.
 * jsdom has no download machinery, so "an anchor was clicked" is true whether
 * or not a real browser would produce a file — the timing is the only evidence
 * available here, and the timing is precisely what was wrong.
 */
describe('downloadCsv', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // The anchor is removed on a timer, so a test that never advances the
    // clock leaves one behind for the next test to trip over.
    document.body.replaceChildren();
  });

  function spyOnObjectUrl() {
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    return { create, revoke };
  }

  it('leaves the blob URL alive when the click returns', () => {
    vi.useFakeTimers();
    const { revoke } = spyOnObjectUrl();

    downloadCsv('feedback.csv', 'id,name');

    // Revoking here can destroy the blob before the browser has read it, and
    // the failure mode is a click that silently produces nothing.
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes the blob URL once the browser has had time to read it', () => {
    vi.useFakeTimers();
    const { create, revoke } = spyOnObjectUrl();

    downloadCsv('feedback.csv', 'id\r\n1');
    vi.advanceTimersByTime(REVOKE_DELAY_MS);

    // Deferring must not turn into leaking: the blob is held in memory until
    // this runs.
    expect(revoke).toHaveBeenCalledWith(create.mock.results[0]?.value);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('names the file and marks the anchor as a download', () => {
    vi.useFakeTimers();
    spyOnObjectUrl();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    downloadCsv('feedback-2026-08-12.csv', 'id\r\n1');

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('feedback-2026-08-12.csv');
    // Without this the anchor is not in the document and the click is ignored.
    expect(clicked[0]?.isConnected).toBe(true);
  });
});
