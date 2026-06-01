import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, FolderOpen, ExternalLink } from 'lucide-react';

const COLOR_CLASSES = {
  Red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
  Orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  Amber:  { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
  Yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  Green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
  Emerald:{ bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200' },
  Teal:   { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200' },
  Sky:    { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200' },
  Blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  Indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  Violet: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  Purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  Pink:   { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-200' },
  Gray:   { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-200' },
  Slate:  { bg: 'bg-slate-100',  text: 'text-slate-700',  border: 'border-slate-200' },
  Stone:  { bg: 'bg-stone-100',  text: 'text-stone-700',  border: 'border-stone-200' },
};

const DEFAULT_STATUS_COLORS = {
  'In Committee': 'Blue',
  'Referred to WAM': 'Orange',
  'In Committee, Passed Senate': 'Emerald',
  'Passed Assembly, In Committee': 'Violet',
  'Assembly Floor Calendar': 'Teal',
  'Signed': 'Green',
  'Vetoed': 'Red',
};

const DEFAULT_PRIORITY_COLORS = {
  'TOP 5 PRIORITY': 'Red', 'TOP 10 PRIORITY': 'Orange',
  'ACTIVE': 'Blue', 'PASSED': 'Green',
  'BUDGET': 'Purple', 'POST BUDGET': 'Amber', 'MONITORING': 'Gray',
};

function getColorClasses(colorName) {
  return COLOR_CLASSES[colorName] || COLOR_CLASSES.Gray;
}

function ColorBadge({ label, colorName, onClick }) {
  if (!label) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const c = getColorClasses(colorName);
  return (
    <span
      onClick={onClick ? e => { e.preventDefault(); e.stopPropagation(); onClick(); } : undefined}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer hover:opacity-80 transition-opacity ${c.bg} ${c.text} ${c.border}`}
    >
      {label}
    </span>
  );
}

// Multi-select dropdown for statuses - inline expanded view
function MultiStatusSelect({ currentStatuses, options, onSave, onCancel }) {
  const [selected, setSelected] = useState(new Set(currentStatuses));

  function toggle(val) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  }

  return (
    <div className="absolute z-50 bg-white border-2 border-primary rounded-xl shadow-xl p-3 min-w-[220px] max-h-80 overflow-y-auto -left-4 mt-1">
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary/5 rounded-lg cursor-pointer text-xs font-medium">
            <input type="checkbox" checked={selected.has(opt)} onChange={() => toggle(opt)} className="rounded text-primary" />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <button onClick={() => onSave([...selected])} className="flex-1 text-xs font-semibold bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors">Apply</button>
        <button onClick={onCancel} className="flex-1 text-xs font-semibold border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

function InlineSelect({ value, options, onSave, onCancel }) {
  const [val, setVal] = useState(value || '');
  return (
    <select autoFocus value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
      className="text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none max-w-[160px]"
    >
      <option value="">— None —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function BillRow({ bill, onUpdate, onDelete, isAdmin, selected, onToggleSelect, priorityItems, statusItems, committeeItems, uniqueStatuses, uniqueCommittees }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(field, value) { setEditingField(field); setEditValue(value || ''); }
  function commitEdit(field, value) {
    onUpdate(bill.id, { [field]: value !== undefined ? value : editValue });
    setEditingField(null);
  }

  function EditableCell({ field, value }) {
    if (editingField === field) {
      return (
        <input autoFocus value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(field)}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(field); if (e.key === 'Escape') setEditingField(null); }}
          className="w-full text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none min-w-[80px]"
        />
      );
    }
    return (
      <span onClick={e => { if (!isAdmin) return; e.preventDefault(); e.stopPropagation(); startEdit(field, value); }}
        className={`cursor-text hover:bg-muted/50 rounded px-1 -mx-1 text-xs ${!isAdmin ? 'cursor-default' : ''}`} title={isAdmin ? "Click to edit" : ""}>
        {value || <span className="text-muted-foreground/40">—</span>}
      </span>
    );
  }

  // Normalize statuses — support both string and array
  const billStatuses = Array.isArray(bill.latest_status)
    ? bill.latest_status
    : (bill.latest_status ? [bill.latest_status] : []);

  const firstTag = bill.tags?.[0];
  const priorityColorName = priorityItems?.find(i => i.label === firstTag)?.color || DEFAULT_PRIORITY_COLORS[firstTag] || 'Purple';
  // Always prefer Customize-tab configs; fall back to bill data or defaults only if none configured
  const statusOptions = statusItems?.length
    ? statusItems.map(i => i.label)
    : (uniqueStatuses?.length ? uniqueStatuses : Object.keys(DEFAULT_STATUS_COLORS));
  const priorityOptions = priorityItems?.length
    ? priorityItems.map(i => i.label)
    : Object.keys(DEFAULT_PRIORITY_COLORS);

  return (
    <tr className={`border-b border-border/50 hover:bg-muted/20 transition-colors text-xs ${selected ? 'bg-blue-50/50' : ''}`}>
      <td className="py-2 px-3 w-8">
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect} className="rounded" onClick={e => e.stopPropagation()} />
      </td>
      <td className="py-2 px-3 whitespace-nowrap">
        <Link to={`/bills/${bill.id}`} className="font-mono font-semibold text-primary hover:underline">{bill.bill_number}</Link>
        {bill.is_caucus_bill && <span className="ml-1 text-[9px] bg-accent/20 text-accent px-1 rounded font-medium">C</span>}
      </td>
      <td className="py-2 px-3 max-w-[100px]"><EditableCell field="short_name" value={bill.short_name} /></td>
      <td className="py-2 px-3 max-w-[220px]">
        <Link to={`/bills/${bill.id}`} className="hover:text-primary truncate block">
          {bill.title || <span className="text-muted-foreground/40 italic">No title</span>}
        </Link>
      </td>
      <td className="py-2 px-3 whitespace-nowrap"><EditableCell field="senate_sponsor" value={bill.senate_sponsor} /></td>
      <td className="py-2 px-3">
        {editingField === 'committee' ? (
          <InlineSelect value={bill.committee} options={committeeItems?.map(i => i.label) || uniqueCommittees || []} onSave={v => commitEdit('committee', v)} onCancel={() => setEditingField(null)} />
        ) : (
          <span onClick={e => { if (!isAdmin) return; e.preventDefault(); e.stopPropagation(); startEdit('committee', bill.committee); }}
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${isAdmin ? 'cursor-pointer hover:opacity-80' : ''} ${bill.committee ? 'bg-sky-100 text-sky-700 border-sky-200' : 'text-muted-foreground/40'}`}>
            {bill.committee || '—'}
          </span>
        )}
      </td>
      <td className="py-2 px-3">
        <div className="relative">
          {editingField === 'latest_status' ? (
            <MultiStatusSelect
              currentStatuses={billStatuses}
              options={statusOptions}
              onSave={v => { onUpdate(bill.id, { latest_status: v }); setEditingField(null); }}
              onCancel={() => setEditingField(null)}
            />
          ) : (
            <div
              onClick={e => { if (!isAdmin) return; e.preventDefault(); e.stopPropagation(); startEdit('latest_status', ''); }}
              className={`flex flex-wrap gap-1 ${isAdmin ? 'cursor-pointer' : ''}`}
            >
              {billStatuses.length > 0 ? billStatuses.map(s => {
                const colorName = statusItems?.find(i => i.label === s)?.color || DEFAULT_STATUS_COLORS[s] || 'Gray';
                return <ColorBadge key={s} label={s} colorName={colorName} />;
              }) : <span className="text-muted-foreground/40 text-xs">—</span>}
            </div>
          )}
        </div>
      </td>
      <td className="py-2 px-3">
        {editingField === 'tags' ? (
          <InlineSelect value={firstTag} options={priorityOptions} onSave={v => { commitEdit('tags', v ? [v] : []); }} onCancel={() => setEditingField(null)} />
        ) : (
          <div onClick={e => { if (!isAdmin) return; e.preventDefault(); e.stopPropagation(); startEdit('tags', firstTag); }}>
            {firstTag ? <ColorBadge label={firstTag} colorName={priorityColorName} /> : <span className="text-muted-foreground/40 text-xs cursor-pointer">—</span>}
          </div>
        )}
      </td>
      <td className="py-2 px-3"><EditableCell field="pc_contact" value={bill.pc_contact} /></td>
      <td className="py-2 px-3">
        {bill.google_drive_url ? (
          <a href={bill.google_drive_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
            <FolderOpen className="w-3 h-3" /> Open
          </a>
        ) : (
          isAdmin && (
            <span onClick={e => { e.stopPropagation(); startEdit('google_drive_url', ''); }}
              className="text-muted-foreground/40 hover:text-primary cursor-pointer text-[10px] flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Add
            </span>
          )
        )}
        {editingField === 'google_drive_url' && (
          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('google_drive_url')}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit('google_drive_url'); if (e.key === 'Escape') setEditingField(null); }}
            className="w-full text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none mt-1"
            placeholder="https://drive.google.com/..." />
        )}
      </td>
      <td className="py-2 px-3">
        {isAdmin && (
          <button onClick={e => { e.stopPropagation(); onDelete(bill.id, bill.bill_number); }}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}