import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Plus, GripVertical, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';

const COLOR_OPTIONS = [
  { name: 'Red', value: 'Red', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  { name: 'Orange', value: 'Orange', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  { name: 'Amber', value: 'Amber', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { name: 'Yellow', value: 'Yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  { name: 'Green', value: 'Green', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  { name: 'Emerald', value: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { name: 'Teal', value: 'Teal', bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
  { name: 'Sky', value: 'Sky', bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  { name: 'Blue', value: 'Blue', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { name: 'Indigo', value: 'Indigo', bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  { name: 'Violet', value: 'Violet', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  { name: 'Purple', value: 'Purple', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { name: 'Pink', value: 'Pink', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  { name: 'Gray', value: 'Gray', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  { name: 'Slate', value: 'Slate', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  { name: 'Stone', value: 'Stone', bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' },
];

export const COLOR_MAP = Object.fromEntries(COLOR_OPTIONS.map(c => [c.value, c]));

export function getColorClasses(color) {
  return COLOR_MAP[color] || COLOR_MAP['Gray'];
}

import { DEFAULT_PRIORITY_TAGS, DEFAULT_STATUSES, DEFAULT_COMMITTEES } from '@/lib/tracker-defaults';

function ItemEditor({ items, setItems }) {
  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    setItems(prev => [...prev, { label: '', color: 'Gray', sort_order: prev.length }]);
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const colorDef = getColorClasses(item.color);
        return (
          <div key={idx} className="flex items-center gap-3 p-3 bg-white border rounded-lg">
            <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
            <Input
              value={item.label}
              onChange={e => updateItem(idx, 'label', e.target.value)}
              className="flex-1 h-8 text-sm"
              placeholder="Label"
            />
            <select
              value={item.color}
              onChange={e => updateItem(idx, 'color', e.target.value)}
              className="text-sm border rounded-md px-2 py-1.5 bg-background h-8"
            >
              {COLOR_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
            {/* Preview badge */}
            <span className={`px-3 py-1 rounded text-xs font-medium border min-w-[100px] text-center ${colorDef.bg} ${colorDef.text} ${colorDef.border}`}>
              {item.label || 'preview'}
            </span>
            <button
              onClick={() => removeItem(idx)}
              className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        );
      })}

      <button
        onClick={addItem}
        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 mt-2"
      >
        <Plus className="w-4 h-4" /> Add option
      </button>
    </div>
  );
}

function getSectionColorFromConfig(colorName) {
  // Map config color names to hex colors for section headers
  const colorMap = {
    'Red': '#dc2626', 'Orange': '#ea580c', 'Amber': '#f59e0b', 'Yellow': '#eab308',
    'Green': '#16a34a', 'Emerald': '#10b981', 'Teal': '#14b8a6', 'Sky': '#0ea5e9',
    'Blue': '#2563eb', 'Indigo': '#4f46e5', 'Violet': '#8b5cf6', 'Purple': '#9333ea',
    'Pink': '#ec4899', 'Gray': '#6b7280', 'Slate': '#475569', 'Stone': '#78716c',
  };
  return colorMap[colorName] || '#2563eb';
}

function ConfigTab({ configType, defaultItems, description }) {
  const { office } = useOffice();
  const qc = useQueryClient();
  const [items, setItems] = useState(null);

  const { data: configs } = useQuery({
    queryKey: ['tracker-config', office?.id, configType],
    queryFn: () => base44.entities.TrackerConfig.filter({ office_id: office?.id, config_type: configType }),
    enabled: !!office?.id,
  });

  useEffect(() => {
    if (configs !== undefined) {
      if (configs.length > 0 && configs[0].items) {
        setItems(configs[0].items);
      } else if (items === null) {
        setItems(defaultItems);
      }
    }
  }, [configs]);

  async function handleSave() {
    if (!items) return;
    const withOrder = items.map((it, i) => ({ ...it, sort_order: i }));
    if (configs && configs.length > 0) {
      await base44.entities.TrackerConfig.update(configs[0].id, { items: withOrder });
    } else {
      await base44.entities.TrackerConfig.create({
        office_id: office.id,
        config_type: configType,
        items: withOrder,
      });
    }
    
    // Sync section headers with priority tags
    if (configType === 'priority_tags') {
      const existingSections = await base44.entities.SectionHeader.filter({ office_id: office.id });
      const existingNames = new Set(existingSections.map(s => s.name));
      const newNames = new Set(withOrder.map(i => i.label));
      
      // Create missing sections
      let sectionOrder = existingSections.length;
      for (const item of withOrder) {
        if (!existingNames.has(item.label)) {
          const sectionColor = getSectionColorFromConfig(item.color);
          await base44.entities.SectionHeader.create({
            office_id: office.id,
            name: item.label,
            color: sectionColor,
            sort_order: sectionOrder++,
          });
        }
      }
      
      // Remove sections that no longer exist in priority tags (optional - only if no bills use them)
      for (const section of existingSections) {
        if (!newNames.has(section.name)) {
          const billsInSection = await base44.entities.Bill.filter({ office_id: office.id, section_header: section.name });
          if (billsInSection.length === 0) {
            await base44.entities.SectionHeader.delete(section.id);
          }
        }
      }
    }
    
    qc.invalidateQueries({ queryKey: ['tracker-config'] });
    qc.invalidateQueries({ queryKey: ['sections', office?.id] });
    toast({ title: 'Changes saved' });
  }

  if (items === null) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/30 rounded-lg border">
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <ItemEditor items={items} setItems={setItems} />

      <div className="flex justify-end mt-4">
        <Button onClick={handleSave} className="flex items-center gap-2">
          <Save className="w-4 h-4" /> Save changes
        </Button>
      </div>

      {/* Color Reference */}
      <div className="mt-6 border-t pt-4">
        <p className="text-sm font-medium mb-3">Color Reference</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map(c => (
            <span key={c.value} className={`px-2.5 py-1 rounded text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
              {c.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Customize() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Customize Tracker</h1>
        <p className="text-muted-foreground text-sm mt-1">Add, remove, rename, and recolor dropdown options. Changes apply everywhere in the tracker.</p>
      </div>

      <Tabs defaultValue="priority_tags">
        <TabsList>
          <TabsTrigger value="priority_tags">Priority Tags</TabsTrigger>
          <TabsTrigger value="bill_statuses">Bill Statuses</TabsTrigger>
          <TabsTrigger value="committees">Committees</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        <div className="mt-4 bg-white border rounded-xl p-6">
          <TabsContent value="priority_tags">
            <ConfigTab
              configType="priority_tags"
              defaultItems={DEFAULT_PRIORITY_TAGS}
              description="Priority labels shown in the Priority column. Color-coded badges."
            />
          </TabsContent>
          <TabsContent value="bill_statuses">
            <ConfigTab
              configType="bill_statuses"
              defaultItems={[]}
              description="Bill status options shown in the Status column. Color-coded badges. Populated from CSV imports."
            />
          </TabsContent>
          <TabsContent value="committees">
            <ConfigTab
              configType="committees"
              defaultItems={[]}
              description="Committee options for filtering and display in the tracker. Populated from CSV imports."
            />
          </TabsContent>
          <TabsContent value="tags">
            <ConfigTab
              configType="tags"
              defaultItems={[]}
              description="Custom tags for bills. Add labels to categorize and filter bills."
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}