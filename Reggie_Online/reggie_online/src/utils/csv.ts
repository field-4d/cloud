type CsvValue = string | number | boolean | null | undefined;

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  return `${headerLine}\n${body}`;
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
