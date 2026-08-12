/**
 * Excel and Numbers assume the platform's legacy encoding unless a file opens
 * with a byte-order mark, which turns every Arabic export into mojibake.
 */
export const CSV_BOM = '\uFEFF';

export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => string | number | null | undefined;
}

/**
 * A spreadsheet evaluates any cell beginning `=`, `+`, `-` or `@`. Feedback is
 * written by customers, so an export is untrusted input arriving in a program
 * that runs it — the classic CSV injection. A leading apostrophe forces text.
 */
function defuse(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escape(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** RFC 4180: CRLF between records, since Excel on Windows expects it. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((column) => escape(column.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const raw = column.value(row);
        if (raw === null || raw === undefined) return '';
        return escape(defuse(String(raw)));
      })
      .join(','),
  );
  return CSV_BOM + [header, ...body].join('\r\n');
}

/** Hands the browser a file without a server round trip. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
