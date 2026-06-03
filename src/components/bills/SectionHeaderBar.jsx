import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SectionHeaderBar({ section, billCount, expanded, onToggle, onUpdate, onDelete, isAdmin, dragHandleProps, isDragging }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [color, setColor] = useState(section.color || '#1e40af');

  function handleSave() {
    onUpdate(section.id, { name, color });
    setEditing(false);
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-3 font-semibold text-white text-sm cursor-pointer select-none ${isDragging ? 'opacity-70 shadow-lg' : ''}`}
      style={{ backgroundColor: section.color || '#1e40af' }}
      onClick={() => !editing && onToggle()}
    >
      {isAdmin && (
        <div
          {...dragHandleProps}
          onClick={e => e.stopPropagation()}
          className="p-1 hover:bg-white/20 rounded cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 opacity-70" />
        </div>
      )}

      {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}

      {editing ? (
        <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
          <Input value={name} onChange={e => setName(e.target.value)} className="h-7 text-sm bg-white/20 border-white/30 text-white placeholder:text-white/50" />
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer flex-shrink-0" />
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-white/80 hover:text-white" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{section.name}</span>
          <span className="text-xs font-normal opacity-80 flex-shrink-0">{billCount} bill{billCount !== 1 ? 's' : ''}</span>
          {isAdmin && (
            <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => setEditing(true)} className="p-1 hover:bg-white/20 rounded">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(section.id)} className="p-1 hover:bg-white/20 rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}