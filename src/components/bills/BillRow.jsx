import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';

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

// Multi-select dropdown — renders in a portal so it never gets clipped by the table
function MultiSelectDropdown({ anchorEl, currentValues, options, onSave, onCancel, allowNew = false }) {
  const [selected, setSelected] = useState(currentValues || []);
  const [newTag, setNewTag] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 });

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 220),
      });
    }
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e) {
      if (anchorEl && !anchorEl.contains(e.target)) onCancel();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [anchorEl, onCancel]);

  function toggleOption(opt) {
    setSelected(prev => prev.includes(opt) ? prev.filter(s => s !== opt) : [...prev, opt]);
  }

  function addNewTag() {
    const t = newTag.trim();
    if (t && !selected.includes(t)) {
      setSelected(prev => [...prev, t]);
    }
    setNewTag('');
  }

  // All options = predefined + any custom ones already selected
  const allOptions = [...new Set([...options, ...selected])];

  return createPortal(
    <div
      style={{ position: 'absolute', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
      className="bg-white border border-border rounded-lg shadow-xl"
      onMouseDown={e => e.stopPropagation()}
    >
      {allowNew && (
        <div className="p-2 border-b flex gap-1">
          <input
            autoFocus
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } }}
            placeholder="Type a custom tag..."
            className="flex-1 text-xs border rounded px-2 py-1 outline-none focus:border-primary"
          />
          <button onClick={addNewTag} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90">Add</button>
        </div>
      )}
      <div className="max-h-48 overflow-y-auto p-1">
        {allOptions.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No options. Type above to add.</p>}
        {allOptions.map(opt => (
          <button key={opt} onClick={() => toggleOption(opt)}
            className={`w-full text-left px-2 py-1.5 text-xs rounded ${
              selected.includes(opt) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="border-t p-2 flex gap-2">
        <button onClick={() => onSave(selected)}
          className="flex-1 bg-primary text-primary-foreground text-xs py-1 rounded hover:opacity-90">
          Done
        </button>
        <button onClick={onCancel}
          className="flex-1 bg-muted text-muted-foreground text-xs py-1 rounded hover:opacity-80">
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function BillRow({ bill, onUpdate, onDelete, isAdmin, isEditor, selected, onToggleSelect, priorityItems, statusItems, committeeItems, uniqueStatuses, uniqueCommittees }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const tagsAnchorRef = useRef(null);
  const committeeAnchorRef = useRef(null);
  const statusAnchorRef = useRef(null);

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
      <span onClick={e => { if (!isEditor) return; e.preventDefault(); e.stopPropagation(); startEdit(field, value); }}
        className={`cursor-text hover:bg-muted/50 rounded px-1 -mx-1 text-xs ${!isEditor ? 'cursor-default' : ''}`} title={isEditor ? "Click to edit" : ""}>
        {value || <span className="text-muted-foreground/40">—</span>}
      </span>
    );
  }

  // Separate API-controlled fields from user-controlled tags
  const billTags = Array.isArray(bill.tags) ? bill.tags : (bill.tags ? [bill.tags] : []);
  const billCommittees = Array.isArray(bill.committee) ? bill.committee : (bill.committee ? [bill.committee] : []);
  const billMilestones = Array.isArray(bill.milestones) ? bill.milestones : (bill.milestones ? [bill.milestones] : []);
  // Fallback: if no new field yet, use latest_status for procedural status
  const proceduralStatus = bill.current_procedural_status ||
    (Array.isArray(bill.latest_status) ? bill.latest_status[0] : bill.latest_status) || null;
  
  const firstTag = billTags[0];
  const priorityColorName = priorityItems?.find(i => i.label === firstTag)?.color || DEFAULT_PRIORITY_COLORS[firstTag] || 'Purple';
  // Always prefer Customize-tab configs; fall back to bill data or defaults only if none configured
  const statusOptions = statusItems?.length ? statusItems.map(i => i.label) : (uniqueStatuses?.length ? uniqueStatuses : Object.keys(DEFAULT_STATUS_COLORS));
  const priorityOptions = priorityItems?.length ? priorityItems.map(i => i.label) : Object.keys(DEFAULT_PRIORITY_COLORS);
  const committeeOptions = committeeItems?.length ? committeeItems.map(i => i.label) : (uniqueCommittees || []);

  return (
    <tr className={`border-b border-border/50 hover:bg-muted/20 transition-colors text-xs ${selected ? 'bg-blue-50/50' : ''}`}>
      <td className="py-2 px-3 w-8">
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect} className="rounded" onClick={e => e.stopPropagation()} />
      </td>
      <td className="py-2 px-3 whitespace-nowrap">
        <Link to={`/bills/${bill.id}`} className="font-mono font-semibold text-primary hover:underline">{bill.bill_number}</Link>
        {bill.is_caucus_bill && <span className="ml-1 text-[9px] bg-accent/20 text-accent px-1 rounded font-medium">C</span>}
      </td>
      <td className="py-2 px-3">
        <div ref={tagsAnchorRef} onClick={e => { if (!isEditor) return; e.preventDefault(); e.stopPropagation(); startEdit('tags', billTags); }} className="flex flex-wrap gap-1 cursor-pointer">
          {billTags.length > 0 ? billTags.map(tag => (
            <ColorBadge key={tag} label={tag} colorName={priorityItems?.find(i => i.label === tag)?.color || DEFAULT_PRIORITY_COLORS[tag] || 'Purple'} />
          )) : <span className="text-muted-foreground/40 text-xs">—</span>}
        </div>
        {editingField === 'tags' && (
          <MultiSelectDropdown anchorEl={tagsAnchorRef.current} currentValues={billTags} options={priorityOptions}
            onSave={v => commitEdit('tags', v)} onCancel={() => setEditingField(null)} />
        )}
      </td>
      <td className="py-2 px-3 max-w-[100px]"><EditableCell field="section_85" value={bill.section_85} /></td>
      <td className="py-2 px-3 max-w-[200px]">
        <Link to={`/bills/${bill.id}`} className="hover:text-primary truncate block">
          {bill.title || <span className="text-muted-foreground/40 italic">No title</span>}
        </Link>
      </td>
      <td className="py-2 px-3 max-w-[100px]"><EditableCell field="short_name" value={bill.short_name} /></td>
      <td className="py-2 px-3 whitespace-nowrap"><EditableCell field="senate_sponsor" value={bill.senate_sponsor} /></td>
      <td className="py-2 px-3">
        <div ref={committeeAnchorRef} onClick={e => { if (!isEditor) return; e.preventDefault(); e.stopPropagation(); startEdit('committee', bill.committee); }} className="flex flex-wrap gap-1 cursor-pointer">
          {billCommittees.length > 0 ? billCommittees.map(comm => (
            <span key={comm} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-sky-100 text-sky-700 border-sky-200`}>{comm}</span>
          )) : <span className="text-muted-foreground/40 text-xs">—</span>}
        </div>
        {editingField === 'committee' && (
          <MultiSelectDropdown anchorEl={committeeAnchorRef.current} currentValues={billCommittees} options={committeeOptions}
            onSave={v => commitEdit('committee', v)} onCancel={() => setEditingField(null)} />
        )}
      </td>
      <td className="py-2 px-3 min-w-[160px]">
        <div className="flex flex-col gap-1">
          {/* API-controlled: current procedural status (read-only, never contradicts milestones) */}
          {proceduralStatus && (
            <ColorBadge label={proceduralStatus} colorName={statusItems?.find(i => i.label === proceduralStatus)?.color || DEFAULT_STATUS_COLORS[proceduralStatus] || 'Blue'} />
          )}
          {/* API-controlled: accumulated milestones (read-only) */}
          {billMilestones.map(m => (
            <ColorBadge key={m} label={`✓ ${m}`} colorName="Green" />
          ))}
          {/* User-controlled: custom status notes (editable, never overwritten by API) */}
          <div
            ref={statusAnchorRef}
            onClick={e => { if (!isEditor) return; e.preventDefault(); e.stopPropagation(); startEdit('status_notes', bill.status_notes || []); }}
            className="flex flex-wrap gap-1 cursor-pointer min-h-[18px]"
          >
            {(bill.status_notes || []).map(note => (
              <span key={note} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-violet-100 text-violet-700 border-violet-200">
                {note}
              </span>
            ))}
            {isEditor && (!bill.status_notes || bill.status_notes.length === 0) && (
              <span className="text-muted-foreground/30 text-[10px] italic">+ add note</span>
            )}
            {!proceduralStatus && billMilestones.length === 0 && (!bill.status_notes || bill.status_notes.length === 0) && (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </div>
          {editingField === 'status_notes' && (
            <MultiSelectDropdown
              anchorEl={statusAnchorRef.current}
              currentValues={bill.status_notes || []}
              options={statusOptions}
              allowNew={true}
              onSave={v => commitEdit('status_notes', v)}
              onCancel={() => setEditingField(null)}
            />
          )}
        </div>
      </td>
      <td className="py-2 px-3"><EditableCell field="pc_contact" value={bill.pc_contact} /></td>
      <td className="py-2 px-3 max-w-[120px]"><EditableCell field="next_steps" value={bill.next_steps} /></td>
      <td className="py-2 px-3 max-w-[150px]"><EditableCell field="session_comments" value={bill.session_comments} /></td>
      <td className="py-2 px-3 max-w-[120px]"><EditableCell field="lobbyist" value={bill.lobbyist} /></td>
      <td className="py-2 px-3 max-w-[150px]">
        {editingField === 'google_drive_url' ? (
          <input autoFocus value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('google_drive_url')}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit('google_drive_url'); if (e.key === 'Escape') setEditingField(null); }}
            className="w-full text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none min-w-[120px]"
            placeholder="https://..."
          />
        ) : bill.google_drive_url ? (
          <div className="flex items-center gap-1">
            <a href={bill.google_drive_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-primary hover:underline truncate max-w-[100px]" title={bill.google_drive_url}>
              Drive
            </a>
            {isEditor && (
              <span onClick={e => { e.preventDefault(); e.stopPropagation(); startEdit('google_drive_url', bill.google_drive_url); }}
                className="text-muted-foreground/40 hover:text-muted-foreground cursor-pointer text-[10px]">✎</span>
            )}
          </div>
        ) : (
          <span onClick={e => { if (!isEditor) return; e.preventDefault(); e.stopPropagation(); startEdit('google_drive_url', ''); }}
            className={`text-muted-foreground/40 text-xs ${isEditor ? 'cursor-text hover:text-muted-foreground' : ''}`}>—</span>
        )}
      </td>
      <td className="py-2 px-3 text-center">
        {bill.is_caucus_bill ? (
          <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded font-medium">Yes</span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
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