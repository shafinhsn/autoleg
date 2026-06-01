import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLUMN_MAP, BILL_NUMBER_RE, detectSectionTag, getSectionColor } from '@/lib/bill-utils';
import * as XLSX from 'xlsx';

export default function ImportCsv() {
  const { office } = useOffice();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  const BILL_FIELDS = [
    { value: 'bill_number', label: 'Bill Number *' },
    { value: 'title', label: 'Title' },
    { value: 'short_name', label: 'Short Name' },
    { value: 'senate_sponsor', label: 'Senate Sponsor' },
    { value: 'assembly_sponsor', label: 'Assembly Sponsor' },
    { value: 'committee', label: 'Committee' },
    { value: 'latest_status', label: 'Status' },
    { value: 'section_header', label: 'Section / Category' },
    { value: 'tags', label: 'Priority Tag' },
    { value: 'priority_rank', label: 'Priority Rank' },
    { value: 'pc_contact', label: 'P&C Contact' },
    { value: 'next_steps', label: 'Next Steps' },
    { value: 'session_comments', label: 'Session Comments' },
    { value: 'lobbyist', label: 'Lobbyist / Advocate' },
    { value: 'bill_documents', label: 'Bill Documents' },
    { value: 'internal_notes', label: 'Internal Notes' },
    { value: 'staff_assignees', label: 'Staff Assignees' },
    { value: 'linked_senate_bill', label: 'Linked Senate Bill' },
    { value: 'google_drive_url', label: 'Google Drive Link' },
    { value: 'is_caucus_bill', label: 'Caucus Bill' },
    { value: 'skip', label: '— Skip column —' },
  ];

  function parseFile(file) {
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) return;

      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setParsed(rows);

      // Auto-map columns using COLUMN_MAP
      const autoMap = {};
      hdrs.forEach(h => {
        autoMap[h] = COLUMN_MAP[h.toLowerCase().trim()] || 'skip';
      });
      setMapping(autoMap);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFile(e) { const f = e.target.files?.[0]; if (f) parseFile(f); }
  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }

  function buildRows() {
    const rawRows = parsed.map(raw => {
      const row = {};
      Object.entries(mapping).forEach(([col, field]) => {
        if (field !== 'skip' && raw[col] !== undefined) row[field] = raw[col];
      });
      return row;
    });

    let currentSection = null;
    const processed = [];

    for (const row of rawRows) {
      const billNum = String(row.bill_number || '').trim();

      if (!BILL_NUMBER_RE.test(billNum)) {
        // Check for section keyword in bill_number or section_header column
        const detected = detectSectionTag(billNum)
          || detectSectionTag(String(row.section_header || ''))
          || detectSectionTag(Object.values(row).join(' '));
        if (detected) currentSection = detected;
        continue;
      }

      // If no section_header mapped directly, inherit from detected section
      if (!row.section_header && currentSection) {
        row.section_header = currentSection;
      }
      // If no tags mapped, use section_header as tag
      if (!row.tags && row.section_header) {
        row.tags = row.section_header;
      }

      processed.push(row);
    }

    return processed;
  }

  async function handleImport() {
    const validRows = buildRows();
    if (validRows.length === 0) {
      alert('No valid bill rows found. Make sure a column is mapped to "Bill Number".');
      return;
    }

    setImporting(true);
    try {
      const response = await base44.functions.invoke('importBillsFromCsv', {
        office_id: office.id,
        rows: validRows,
      });
      setResult(response.data);
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['sections'] });
    } catch (e) {
      console.error('Import error', e);
      setResult({ created: 0, updated: 0, errors: 1, errorDetails: [{ bill: 'N/A', error: e.message || String(e) }] });
    }
    setImporting(false);
  }

  function reset() {
    setParsed([]); setHeaders([]); setMapping({}); setResult(null); setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const hasBillNumber = Object.values(mapping).includes('bill_number');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Import Bills</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a CSV or Excel (.xlsx) file. Columns are auto-mapped by header name. Section groups like "TOP 5 PRIORITY" are auto-detected from the spreadsheet.
        </p>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">Import Complete</p>
                  <p className="text-sm text-green-700">{result.created} new · {result.updated} updated{result.errors > 0 ? ` · ${result.errors} errors` : ''}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>Import Another</Button>
            </div>
            {result.errors > 0 && result.errorDetails && result.errorDetails.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-64 overflow-auto">
                <p className="font-semibold text-red-900 mb-2">Error Details:</p>
                <ul className="text-sm text-red-800 space-y-1">
                  {result.errorDetails.slice(0, 50).map((err, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono">{err.bill}:</span>
                      <span>{err.error}</span>
                    </li>
                  ))}
                </ul>
                {result.errorDetails.length > 50 && (
                  <p className="text-xs text-red-600 mt-2">...and {result.errorDetails.length - 50} more errors</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {parsed.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
        >
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">Drop your file here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">Supports .csv and .xlsx files</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      )}

      {parsed.length > 0 && !result && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Column Mapping — <span className="font-normal text-muted-foreground">{fileName}</span>
                <span className="ml-2 text-sm font-normal text-muted-foreground">({parsed.length} rows)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-44 truncate" title={h}>{h}</span>
                    <span className="text-muted-foreground">→</span>
                    <select
                      value={mapping[h] || 'skip'}
                      onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      className="text-sm border rounded px-2 py-1.5 bg-background flex-1"
                    >
                      {BILL_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={handleImport} disabled={importing || !hasBillNumber}>
              {importing ? 'Importing...' : `Import ${parsed.length} Rows`}
            </Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
          {!hasBillNumber && (
            <p className="text-sm text-destructive">Map at least one column to "Bill Number" before importing.</p>
          )}
        </div>
      )}
    </div>
  );
}