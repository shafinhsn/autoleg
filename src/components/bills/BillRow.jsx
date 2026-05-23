import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ExternalLink, FolderOpen } from 'lucide-react';
import MultiTagSelect from './MultiTagSelect';

export default function BillRow({ bill, onUpdate, onDelete, isAdmin }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(field, value) {
    setEditingField(field);
    setEditValue(value || '');
  }

  function commitEdit(field) {
    onUpdate(bill.id, { [field]: editValue });
    setEditingField(null);
  }

  function EditableCell({ field, value, className = '' }) {
    if (editingField === field) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(field)}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(field); if (e.key === 'Escape') setEditingField(null); }}
          className="w-full text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none"
        />
      );
    }
    return (
      <span
        onClick={e => { e.preventDefault(); e.stopPropagation(); startEdit(field, value); }}
        className={`cursor-text hover:bg-muted/50 rounded px-1 -mx-1 ${className}`}
        title="Click to edit"
      >
        {value || <span className="text-muted-foreground/40">—</span>}
      </span>
    );
  }

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors text-xs">
      <td className="py-2.5 px-3">
        <Link to={`/bills/${bill.id}`} className="font-mono font-semibold text-primary hover:underline">
          {bill.bill_number}
        </Link>
        {bill.is_caucus_bill && (
          <span className="ml-1 text-[9px] bg-accent/20 text-accent px-1 rounded font-medium">C</span>
        )}
      </td>
      <td className="py-2.5 px-3 max-w-[120px] truncate">
        <EditableCell field="short_name" value={bill.short_name} />
      </td>
      <td className="py-2.5 px-3 max-w-[200px]">
        <Link to={`/bills/${bill.id}`} className="hover:text-primary truncate block">
          {bill.title || <span className="text-muted-foreground/40 italic">No title</span>}
        </Link>
      </td>
      <td className="py-2.5 px-3">
        <EditableCell field="senate_sponsor" value={bill.senate_sponsor} />
      </td>
      <td className="py-2.5 px-3">
        <EditableCell field="committee" value={bill.committee} />
      </td>
      <td className="py-2.5 px-3">
        <EditableCell field="latest_status" value={bill.latest_status} />
      </td>
      <td className="py-2.5 px-3">
        <MultiTagSelect
          tags={bill.tags || []}
          onChange={tags => onUpdate(bill.id, { tags })}
        />
      </td>
      <td className="py-2.5 px-3">
        <EditableCell field="pc_contact" value={bill.pc_contact} />
      </td>
      <td className="py-2.5 px-3">
        {bill.google_drive_url ? (
          <a href={bill.google_drive_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
            <FolderOpen className="w-3 h-3" /> Open
          </a>
        ) : (
          <span onClick={e => { e.stopPropagation(); startEdit('google_drive_url', ''); }} className="text-muted-foreground/40 hover:text-primary cursor-pointer text-[10px] flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> Add link
          </span>
        )}
        {editingField === 'google_drive_url' && (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('google_drive_url')}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit('google_drive_url'); if (e.key === 'Escape') setEditingField(null); }}
            className="w-full text-xs border border-primary rounded px-1.5 py-0.5 bg-white outline-none mt-1"
            placeholder="https://drive.google.com/..."
          />
        )}
      </td>
      <td className="py-2.5 px-3">
        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(bill.id, bill.bill_number); }}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}