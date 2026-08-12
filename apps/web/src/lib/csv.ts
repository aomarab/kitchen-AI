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

/**
 * How long the blob URL is left alive after the click.
 *
 * Revoking is not optional — the blob is held in memory until it happens — but
 * it must not happen in the same tick. See `downloadCsv`.
 */
export const REVOKE_DELAY_MS = 1000;

/**
 * Hands the browser a file without a server round trip.
 *
 * The teardown is deferred deliberately. A click on a download link only
 * *starts* the download; the browser reads the blob afterwards, on its own
 * schedule. Revoking the URL in the same tick — the obvious way to write this,
 * and the way it was written first — can destroy the blob before that read, and
 * the failure mode is a click that silently produces no file. Instrumenting the
 * first version in Chromium showed revocation landing 0.2 ms after the click,
 * i.e. squarely inside the window where it is unsafe.
 *
 * jsdom cannot catch this, because it has no download machinery to abort: the
 * anchor is created, the click is dispatched, and the test passes either way.
 * So the unit test asserts the *timing* instead — that the URL is still alive
 * when the click returns, and that it is eventually released.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}
