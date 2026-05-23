import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Upload, FileText, CheckCircle2, AlertCircle, Tag, X } from 'lucide-react';
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
  const lines = text.split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += line[i];
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
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
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
    setResult(null);
    setSectionPreview([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: hdrs, rows } = parseCSV(e.target.result);
      setHeaders(hdrs);
      setParsed(rows);
      const autoMap = {};
      hdrs.forEach(h => {
        const lower = h.toLowerCase().trim();
        autoMap[h] = COLUMN_MAP[lower] || 'skip';
      });
      setMapping(autoMap);
      toast({ title: `Parsed ${rows.length} rows from ${file.name}` });
    };
    reader.readAsText(file);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function buildRows() {
    const rawRows = parsed.map(raw => {
      const row = {};
      Object.entries(mapping).forEach(([col, field]) => {
        if (field !== 'skip' && raw[col] !== undefined) {
          row[field] = raw[col];
        }
      });
      return row;
    });

    let currentSection = null;
    let top5Counter = 0;
    const processed = [];
    const sectionCounts = {};

    for (const row of rawRows) {
      const billNum = row.bill_number?.trim() ?? '';

      // Check if this row is a section header
      if (billNum && !BILL_NUMBER_RE.test(billNum)) {
        const detectedTag = detectSectionTag(billNum);
        if (detectedTag) {
          currentSection = detectedTag;
          top5Counter = 0;
          continue;
        }
        // Also check other cells for section headers
        const allValues = Object.values(row).join(' ');
        const tagFromValues = detectSectionTag(allValues);
        if (tagFromValues) {
          currentSection = tagFromValues;
          top5Counter = 0;
          continue;
        }
        continue;
      }

      if (!billNum) continue;

      // Apply section tag
      if (!row.tags && currentSection) {
        if (currentSection === 'TOP 5 PRIORITY') {
          top5Counter++;
          row.tags = `${top5Counter}/5 TOP 5`;
        } else {
          row.tags = currentSection;
        }
      }

      row.section_header = currentSection || '';
      sectionCounts[row.section_header || 'Untagged'] = (sectionCounts[row.section_header || 'Untagged'] || 0) + 1;
      processed.push(row);
    }

    setSectionPreview(Object.entries(sectionCounts).map(([tag, count]) => ({ tag, count })));
    return processed;
  }

  async function handleImport() {
    const validRows = buildRows();
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Check your column mapping', variant: 'destructive' });
      return;
    }

    setImporting(true);
    let imported = 0, skipped = 0, errors = 0;

    // Create section headers
    const existingSections = await base44.entities.SectionHeader.filter({ office_id: office.id });
    const existingNames = new Set(existingSections.map(s => s.name));
    const newSections = [...new Set(validRows.map(r => r.section_header).filter(Boolean))].filter(n => !existingNames.has(n));
    
    for (let i = 0; i < newSections.length; i++) {
      await base44.entities.SectionHeader.create({
        office_id: office.id,
        name: newSections[i],
        color: getSectionColor(newSections[i]),
        sort_order: existingSections.length + i,
      });
    }

    // Get existing bills to merge
    const existingBills = await base44.entities.Bill.filter({ office_id: office.id });
    const existingMap = {};
    existingBills.forEach(b => { existingMap[b.bill_number?.toUpperCase()] = b; });

    for (const row of validRows) {
      const billNum = row.bill_number?.trim().toUpperCase();
      if (!billNum) { skipped++; continue; }

      const billData = {
        ...row,
        bill_number: billNum,
        office_id: office.id,
        tags: row.tags ? (Array.isArray(row.tags) ? row.tags : [row.tags]) : [],
        chamber: billNum.startsWith('S') ? 'Senate' : 'Assembly',
        session_year: 2026,
        is_caucus_bill: row.is_caucus_bill === 'true' || row.is_caucus_bill === 'yes' || row.is_caucus_bill === '1',
      };

      try {
        if (existingMap[billNum]) {
          await base44.entities.Bill.update(existingMap[billNum].id, billData);
        } else {
          await base44.entities.Bill.create(billData);
        }
        imported++;
      } catch {
        errors++;
      }
    }

    setResult({ imported, skipped, errors });
    qc.invalidateQueries({ queryKey: ['bills'] });
    qc.invalidateQueries({ queryKey: ['sections'] });
    setImporting(false);
    toast({ title: `Imported ${imported} bills` });
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
                <p className="text-sm text-green-700">{result.imported} imported, {result.skipped} skipped{result.errors > 0 ? `, ${result.errors} errors` : ''}</p>
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
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
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
            <CardHeader>
              <CardTitle className="text-base">Column Mapping ({parsed.length} rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-40 truncate">{h}</span>
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
            <Button onClick={() => { buildRows(); toast({ title: 'Preview updated' }); }} variant="outline" size="sm">Preview Sections</Button>
            <Button onClick={handleImport} disabled={importing || !Object.values(mapping).includes('bill_number')}>
              {importing ? 'Importing...' : `Import ${parsed.length} Rows`}
            </Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}