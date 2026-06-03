import { useState, useRef, useEffect } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';

const DEFAULT_TAGS = [
  'TOP 5 PRIORITY', 'TOP 10 PRIORITY', 'ACTIVE', 'PASSED',
  'BUDGET', 'POST BUDGET', 'MONITORING', 'CAUCUS BILLS'
];

export default function MultiTagSelect({ tags = [], onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function addTag(tag) {
    if (!tags.includes(tag)) {
      onChange([...tags, tag]);
    }
  }

  function removeTag(tag) {
    // Always allow removal, even if it's the last tag
    onChange(tags.filter(t => t !== tag));
  }

  const available = DEFAULT_TAGS.filter(t => !tags.includes(t));

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="flex flex-wrap gap-1 items-center min-h-[28px]">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            {tag}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="hover:bg-primary/20 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground rounded border border-dashed border-border hover:border-primary/50 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {open && available.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-0.5 bg-popover border rounded-md shadow-md py-1 max-h-40 overflow-y-auto w-max max-w-xs">
          {available.map(tag => (
            <button
              key={tag}
              onClick={() => { addTag(tag); setOpen(false); }}
              className="text-left px-2.5 py-1 text-[11px] hover:bg-muted transition-colors whitespace-nowrap"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}