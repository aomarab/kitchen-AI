import { describe, expect, it } from 'vitest';
import { toCsv, CSV_BOM } from './csv';

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
