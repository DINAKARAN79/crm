type ReportExportResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function reportCsvFilename(name: string): string {
  const safe = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'report';
  return `${safe}.csv`;
}

export function createReportCsv(result: ReportExportResult): string {
  const columns = result.columns || [];
  const rows = result.rows || [];
  const header = columns.map(escapeCsvValue).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','));
  return [header, ...lines].join('\r\n');
}
