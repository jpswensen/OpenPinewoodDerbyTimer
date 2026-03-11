import { apiFetch } from '../client'

export type CsvImportError = { row: number; error: string }

export type ImportCsvResult = {
  groups_created: number
  racers_created: number
  errors: CsvImportError[]
}

export function importRacersCsv(file: File): Promise<ImportCsvResult> {
  const fd = new FormData()
  fd.append('file', file)
  return apiFetch('/import/csv', { method: 'POST', body: fd })
}

export function exportRacersCsv(): Promise<string> {
  return apiFetch('/export/csv', { headers: { Accept: 'text/csv' } })
}
