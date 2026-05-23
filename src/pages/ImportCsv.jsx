import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Upload, CheckCircle2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { COLUMN_MAP, BILL_NUMBER_RE, detectSectionTag, getSectionColor } from '@/lib/bill-utils';

const BILL_FIELDS = [
  { value: 'bill_number', label: 'Bill Number *' },
  { value: 'title', label: 'Title' },
  { value: 'short_name', label: 'Short Name' },
  { value: 'senate_sponsor', label: 'Senate Sponsor' },
  { value: 'assembly_sponsor', label: 'Assembly Sponsor' },
  { value: 'committee', label: 'Committee' },
  { value: 'latest_status', label: 'Status' },
  { value: 'pc_contact', label: 'P&C Contact' },
  { value: 'next_steps', label: 'Next Steps' },
  { value: 'session_comments', label: 'Session Comments' },
  { value: 'lobbyist', label: 'Lobbyist / Advocate' },
  { value: 'bill_documents', label: 'Bill Documents' },
  { value: 'tags', label: 'Priority Tag' },
  { value: 'priority_rank', label: 'Priority Rank' },
  { value: 'internal_notes', label: 'Internal Notes' },
  { value: 'staff_assignees', label: 'Staff Assignees' },
  { value: 'linked_senate_bill', label: 'Linked Senate Bill' },
  { value: 'google_drive_url', label: 'Google Drive Link' },
  { value: 'is_caucus_bill', label: 'Caucus Bill' },
  { value: 'skip', label: '— Skip column —' },
];

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

export default function ImportCsv() {
  const { office } = useOffice();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [sectionPreview, setSectionPreview] = useState([]);
  const [importing, setImporting] = useState(false);

  function processFile(file) {
    setResult(null); setSectionPreview([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: hdrs, rows } = parseCSV(e.target.result);
      setHeaders(hdrs); setParsed(rows);
      const autoMap = {};
      hdrs.forEach(h => { autoMap[h] = COLUMN_MAP[h.toLowerCase().trim()] || 'skip'; });
      setMapping(autoMap);
      toast({ title: `Parsed ${rows.length} rows from ${file.name}` });
    };
    reader.readAsText(file);
  }

  function handleFile(e) { const f = e.target.files?.[0]; if (f) processFile(f); }
  function handleDrop(e) { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }

  function buildRows() {
    const rawRows = parsed.map(raw => {
      const row = {};
      Object.entries(mapping).forEach(([col, field]) => {
        if (field !== 'skip' && raw[col] !== undefined) row[field] = raw[col];
      });
      return row;
    });

    let currentSection = null;
    let top5Counter = 0;
    const processed = [];
    const sectionCounts = {};

    for (const row of rawRows) {
      const billNum = (row.bill_number || '').trim();

      if (!BILL_NUMBER_RE.test(billNum)) {
        // Not a valid bill — check for section keyword
        const detected = detectSectionTag(billNum) || detectSectionTag(Object.values(row).join(' '));
        if (detected) { currentSection = detected; top5Counter = 0; }
        continue;
      }

      // Valid bill
      if (!row.tags && currentSection) {
        row.tags = currentSection === 'TOP 5 PRIORITY' ? `${++top5Counter}/5 TOP 5` : currentSection;
      }
      row.section_header = currentSection || '';
      const key = row.section_header || 'Untagged';
      sectionCounts[key] = (sectionCounts[key] || 0) + 1;
      processed.push(row);
    }

    setSectionPreview(Object.entries(sectionCounts).map(([tag, count]) => ({ tag, count })));
    return processed;
  }

  async function handleImport() {
    const validRows = buildRows();
    if (validRows.length === 0) {
      toast({ title: 'No valid bill rows found', description: 'Make sure a column is mapped to "Bill Number"', variant: 'destructive' });
      return;
    }

    setImporting(true);
    let created = 0, updated = 0, errors = 0;

    const existingSections = await base44.entities.SectionHeader.filter({ office_id: office.id });
    const existingNames = new Set(existingSections.map(s => s.name));
    const newNames = [...new Set(validRows.map(r => r.section_header).filter(Boolean))].filter(n => !existingNames.has(n));
    for (let i = 0; i < newNames.length; i++) {
      await base44.entities.SectionHeader.create({
        office_id: office.id, name: newNames[i],
        color: getSectionColor(newNames[i]), sort_order: existingSections.length + i,
      });
    }

    const existingBills = await base44.entities.Bill.filter({ office_id: office.id });
    const existingMap = {};
    existingBills.forEach(b => { existingMap[b.bill_number?.toUpperCase()] = b; });

    for (const row of validRows) {
      const billNum = row.bill_number.trim().toUpperCase();
      const billData = {
        ...row, bill_number: billNum, office_id: office.id,
        tags: row.tags ? (Array.isArray(row.tags) ? row.tags : [row.tags]) : [],
        chamber: billNum.startsWith('S') ? 'Senate' : 'Assembly',
        session_year: 2026,
        is_caucus_bill: ['true','yes','1','x'].includes((row.is_caucus_bill || '').toLowerCase()),
      };
      try {
        if (existingMap[billNum]) { await base44.entities.Bill.update(existingMap[billNum].id, billData); updated++; }
        else { await base44.entities.Bill.create(billData); created++; }
      } catch (e) { console.error('Import error', billNum, e); errors++; }
    }

    setResult({ created, updated, errors });
    qc.invalidateQueries({ queryKey: ['bills'] });
    qc.invalidateQueries({ queryKey: ['sections'] });
    setImporting(false);
    toast({ title: `Import complete: ${created} new, ${updated} updated` });
  }

  function reset() {
    setParsed([]); setHeaders([]); setMapping({}); setResult(null); setSectionPreview([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Import CSV</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload your spreadsheet. Section headers like "TOP TEN PRIORITY" are auto-detected and create colored section groups.</p>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Import Complete</p>
                <p className="text-sm text-green-700">{result.created} new · {result.updated} updated{result.errors > 0 ? ` · ${result.errors} errors` : ''}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Import Another</Button>
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
          <p className="font-medium">Drop your CSV here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">Supports .csv files</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {parsed.length > 0 && !result && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Column Mapping ({parsed.length} rows detected)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-44 truncate" title={h}>{h}</span>
                    <span className="text-muted-foreground">→</span>
                    <select value={mapping[h] || 'skip'} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      className="text-sm border rounded px-2 py-1.5 bg-background flex-1">
                      {BILL_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {sectionPreview.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4" /> Detected Sections</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {sectionPreview.map(s => (
                    <span key={s.tag} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: getSectionColor(s.tag) }}>
                      {s.tag} ({s.count})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={buildRows} variant="outline" size="sm">Preview Sections</Button>
            <Button onClick={handleImport} disabled={importing || !Object.values(mapping).includes('bill_number')}>
              {importing ? 'Importing...' : `Import ${parsed.length} Rows`}
            </Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
          {!Object.values(mapping).includes('bill_number') && (
            <p className="text-sm text-destructive">Map at least one column to "Bill Number" before importing.</p>
          )}
        </div>
      )}
    </div>
  );
}