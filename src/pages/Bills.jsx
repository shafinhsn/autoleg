import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Search, Plus, RefreshCw, Upload, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SectionHeaderBar from '@/components/bills/SectionHeaderBar';
import BillRow from '@/components/bills/BillRow.jsx';
import { getSectionColor } from '@/lib/bill-utils';
import { COLOR_MAP } from '@/pages/Customize';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function Bills() {
  const { office, isOwner, isAdmin, isEditor } = useOffice();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCommittee, setFilterCommittee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null); // { done, total }
  const [selectedBills, setSelectedBills] = useState(new Set());
  const [deleteResult, setDeleteResult] = useState(null);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', office?.id],
    queryFn: () => base44.entities.Bill.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections', office?.id],
    queryFn: () => base44.entities.SectionHeader.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: priorityConfigs = [] } = useQuery({
    queryKey: ['tracker-config', office?.id, 'priority_tags'],
    queryFn: () => base44.entities.TrackerConfig.filter({ office_id: office?.id, config_type: 'priority_tags' }),
    enabled: !!office?.id,
  });

  const { data: statusConfigs = [] } = useQuery({
    queryKey: ['tracker-config', office?.id, 'bill_statuses'],
    queryFn: () => base44.entities.TrackerConfig.filter({ office_id: office?.id, config_type: 'bill_statuses' }),
    enabled: !!office?.id,
  });

  const { data: committeeConfigs = [] } = useQuery({
    queryKey: ['tracker-config', office?.id, 'committees'],
    queryFn: () => base44.entities.TrackerConfig.filter({ office_id: office?.id, config_type: 'committees' }),
    enabled: !!office?.id,
  });

  useEffect(() => {
    if (sections.length > 0 && expandedSections.size === 0) {
      setExpandedSections(new Set(sections.map(s => s.id)));
    }
  }, [sections]);

  function toggleSection(id) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function invalidateBills() {
    qc.invalidateQueries({ queryKey: ['bills', office?.id] });
  }

  function invalidateConfigs() {
    qc.invalidateQueries({ queryKey: ['tracker-config', office?.id] });
  }

  // Resolve config items — use saved configs only (empty after clear data)
  const statusItems = statusConfigs[0]?.items?.length ? statusConfigs[0].items : [];
  const committeeItems = committeeConfigs[0]?.items?.length ? committeeConfigs[0].items : [];
  const priorityItems = priorityConfigs[0]?.items?.length ? priorityConfigs[0].items : [];

  // Build filter options from ACTUAL bill data so filters always match what's visible
  const uniqueStatuses = [...new Set(
    bills.map(b => b.current_procedural_status || (Array.isArray(b.latest_status) ? b.latest_status[0] : b.latest_status) || '')
         .filter(Boolean)
  )].sort();
  const uniqueCommittees = [...new Set(
    bills.flatMap(b => Array.isArray(b.committee) ? b.committee : (b.committee ? [b.committee] : []))
         .filter(Boolean)
  )].sort();
  const uniquePriorities = priorityItems.length
    ? priorityItems.map(i => i.label)
    : [...new Set(bills.flatMap(b => b.tags || []).filter(Boolean))].sort();

  const filtered = bills.filter(b => {
    if (search && !b.bill_number?.toLowerCase().includes(search.toLowerCase()) &&
        !b.title?.toLowerCase().includes(search.toLowerCase()) &&
        !b.short_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus) {
      const ps = b.current_procedural_status || (Array.isArray(b.latest_status) ? b.latest_status[0] : b.latest_status) || '';
      if (ps !== filterStatus) return false;
    }
    if (filterCommittee) {
      const committees = Array.isArray(b.committee) ? b.committee : (b.committee ? [b.committee] : []);
      if (!committees.includes(filterCommittee)) return false;
    }
    if (filterPriority && !(b.tags || []).includes(filterPriority)) return false;
    return true;
  });

  const isFiltering = !!(search || filterStatus || filterCommittee || filterPriority);

  const sortedSections = [...sections].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sectionedBills = sortedSections
    .map(s => ({ section: s, bills: filtered.filter(b => b.section_header === s.name) }))
    .filter(({ bills }) => !isFiltering || bills.length > 0);
  const unsectionedBills = filtered.filter(b => !b.section_header || !sections.find(s => s.name === b.section_header));

  const [addingBill, setAddingBill] = useState(false);

  async function handleAddBill() {
    if (!newBillNumber.trim() || addingBill) return;
    setAddingBill(true);
    await base44.entities.Bill.create({
      bill_number: newBillNumber.trim().toUpperCase(),
      office_id: office.id,
      chamber: newBillNumber.trim().toUpperCase().startsWith('S') ? 'Senate' : 'Assembly',
      session_year: 2026,
      tags: [],
    });
    invalidateBills();
    setNewBillNumber('');
    setShowAddForm(false);
    setAddingBill(false);
  }

  async function handleUpdateBill(id, data) {
    // Ensure array fields are always arrays
    if (data.latest_status !== undefined) {
      data.latest_status = Array.isArray(data.latest_status) ? data.latest_status : (data.latest_status ? [data.latest_status] : []);
    }
    if (data.committee !== undefined) {
      data.committee = Array.isArray(data.committee) ? data.committee : (data.committee ? [data.committee] : []);
    }
    if (data.tags !== undefined) {
      data.tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    }
    // When priority tag changes, update section_header to match first tag and ensure section exists
    if (data.tags !== undefined && data.tags.length > 0) {
      const firstTag = data.tags[0];
      data.section_header = firstTag;
      // Ensure section header exists for this priority tag
      const existingSection = sections.find(s => s.name === firstTag);
      if (!existingSection) {
        // Get the color from priority config
        const priorityConfig = priorityItems.find(i => i.label === firstTag);
        const sectionColor = priorityConfig?.color ? getSectionColorFromConfig(priorityConfig.color) : getSectionColor(firstTag);
        await base44.entities.SectionHeader.create({
          office_id: office.id,
          name: firstTag,
          color: sectionColor,
          sort_order: sections.length,
        });
        qc.invalidateQueries({ queryKey: ['sections', office?.id] });
      }
    } else if (data.tags !== undefined && data.tags.length === 0) {
      data.section_header = '';
    }
    // Optimistic update — patch local cache immediately, no refetch needed
    qc.setQueryData(['bills', office?.id], (old = []) =>
      old.map(b => b.id === id ? { ...b, ...data } : b)
    );
    await base44.entities.Bill.update(id, data);
  }

  async function handleDeleteBill(id, billNumber) {
    if (!confirm(`Remove ${billNumber} from tracker?`)) return;
    qc.setQueryData(['bills', office?.id], (old = []) => old.filter(b => b.id !== id));
    base44.entities.Bill.delete(id).then(invalidateBills);
  }

  async function handleSync() {
    if (bills.length === 0) return;
    setSyncing(true);
    const BATCH_SIZE = 25;
    const allIds = bills.map(b => b.id);
    const total = allIds.length;
    let done = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    setSyncProgress({ done: 0, total });
    try {
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const response = await base44.functions.invoke('syncAllBills', { officeId: office.id, billIds: batch });
        const { updated = 0, errors = 0, skipped = 0 } = response.data;
        totalUpdated += updated;
        totalErrors += errors;
        totalSkipped += skipped;
        done += batch.length;
        setSyncProgress({ done, total });
      }
      await invalidateBills();
      invalidateConfigs();
      alert(`Sync complete!\n✓ ${totalUpdated} bills updated\n⚠ ${totalErrors} errors\n— ${totalSkipped} skipped\nTotal: ${total}`);
    } catch (e) {
      console.error('Sync error', e);
      alert('Sync failed: ' + e.message);
    }
    setSyncing(false);
    setSyncProgress(null);
  }

  function getSectionColorFromConfig(colorName) {
    const colorDef = COLOR_MAP[colorName];
    if (!colorDef) return getSectionColor('ACTIVE');
    // Map color name to hex based on typical shade
    const colorToHex = {
      Red: '#dc2626', Orange: '#ea580c', Amber: '#f59e0b', Yellow: '#eab308',
      Green: '#16a34a', Emerald: '#10b981', Teal: '#14b8a6', Sky: '#0ea5e9',
      Blue: '#2563eb', Indigo: '#4f46e5', Violet: '#8b5cf6', Purple: '#9333ea',
      Pink: '#ec4899', Gray: '#6b7280', Slate: '#475569', Stone: '#78716c',
    };
    return colorToHex[colorName] || '#2563eb';
  }

  async function handleUpdateSection(id, data) {
    await base44.entities.SectionHeader.update(id, data);
    qc.invalidateQueries({ queryKey: ['sections', office?.id] });
  }

  async function handleDeleteSection(id) {
    if (!confirm('Delete this section header?')) return;
    // Optimistically remove from cache immediately
    qc.setQueryData(['sections', office?.id], (old = []) => old.filter(s => s.id !== id));
    try {
      await base44.entities.SectionHeader.delete(id);
    } catch (e) {
      // Already deleted or not found — cache is already clean, nothing to do
    }
  }

  async function addSection() {
    const name = prompt('Section name (e.g. TOP 5 PRIORITY):');
    if (!name?.trim()) return;
    const sectionName = name.trim().toUpperCase();
    await base44.entities.SectionHeader.create({
      office_id: office.id,
      name: sectionName,
      color: getSectionColor(sectionName),
      sort_order: sections.length,
    });
    const existingConfig = await base44.entities.TrackerConfig.filter({ office_id: office.id, config_type: 'priority_tags' });
    if (existingConfig.length > 0) {
      const config = existingConfig[0];
      const items = config.items || [];
      if (!items.find(i => i.label === sectionName)) {
        await base44.entities.TrackerConfig.update(config.id, {
          items: [...items, { label: sectionName, color: 'blue', sort_order: items.length }],
        });
        qc.invalidateQueries({ queryKey: ['tracker-config'] });
      }
    } else {
      await base44.entities.TrackerConfig.create({
        office_id: office.id,
        config_type: 'priority_tags',
        items: [{ label: sectionName, color: 'blue', sort_order: 0 }],
      });
      qc.invalidateQueries({ queryKey: ['tracker-config'] });
    }
    qc.invalidateQueries({ queryKey: ['sections', office?.id] });
  }

  async function handleDragEnd(result) {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = [...sortedSections];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i }));
    qc.setQueryData(['sections', office?.id], updated);
    for (const s of updated) {
      await base44.entities.SectionHeader.update(s.id, { sort_order: s.sort_order });
    }
  }

  function toggleSelectAll(billsList) {
    const allSelected = billsList.every(b => selectedBills.has(b.id));
    setSelectedBills(prev => {
      const next = new Set(prev);
      billsList.forEach(b => allSelected ? next.delete(b.id) : next.add(b.id));
      return next;
    });
  }

  function handleExportCSV() {
    const headers = [
      'bill_number', 'short_name', 'title', 'senate_sponsor', 'assembly_sponsor',
      'committee', 'latest_status', 'section_header', 'tags',
      'pc_contact', 'next_steps', 'session_comments', 'lobbyist',
      'bill_documents', 'internal_notes', 'staff_assignees',
      'linked_senate_bill', 'google_drive_url', 'is_caucus_bill',
      'chamber', 'session_year', 'hearing_date', 'hearing_time', 'hearing_location',
    ];
    function escape(val) {
      if (val === null || val === undefined) return '';
      const str = Array.isArray(val) ? val.join('; ') : String(val);
      return (str.includes(',') || str.includes('"') || str.includes('\n'))
        ? `"${str.replace(/"/g, '""')}"` : str;
    }
    const rows = [headers.join(','), ...bills.map(bill => headers.map(h => escape(bill[h])).join(','))];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bills-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Bill Tracker</h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm w-36" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background h-9">
          <option value="">All Statuses</option>
          {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCommittee} onChange={e => setFilterCommittee(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background h-9">
          <option value="">All Committees</option>
          {uniqueCommittees.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background h-9">
          <option value="">All Priorities</option>
          {uniquePriorities.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {selectedBills.size > 0 && (
            <Button variant="destructive" size="sm" onClick={async () => {
              if (!confirm(`Delete ${selectedBills.size} selected bill(s)?`)) return;
              const ids = [...selectedBills];
              try {
                const response = await base44.functions.invoke('bulkDeleteBills', {
                  billIds: ids,
                  officeId: office.id,
                });
                if (response.data.errors > 0) {
                  alert(`Deleted ${response.data.deleted} bills. ${response.data.errors} errors occurred.`);
                }
                invalidateBills();
              } catch (e) {
                console.error('Bulk delete error', e);
                alert('Error deleting bills: ' + e.message);
              }
              setSelectedBills(new Set());
            }}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete {selectedBills.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="min-w-[120px]">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncProgress
              ? `${Math.round((syncProgress.done / syncProgress.total) * 100)}% (${syncProgress.done}/${syncProgress.total})`
              : syncing ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/import"><Upload className="w-4 h-4 mr-1.5" /> Import</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={bills.length === 0}>
            <Download className="w-4 h-4 mr-1.5" /> Export
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="w-4 h-4 mr-1.5" /> Section
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} disabled={!isEditor}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Bill
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
          <Input placeholder="Bill number (e.g. A1234)" value={newBillNumber}
            onChange={e => setNewBillNumber(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddBill(); }}
            className="max-w-xs text-sm" autoFocus />
          <Button size="sm" onClick={handleAddBill} disabled={addingBill}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No bills found. Add a bill or import a CSV.</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="bg-card rounded-xl border overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
            <div className="overflow-auto h-full">
              <table className="w-full text-left" style={{ minWidth: '1400px', borderCollapse: 'collapse' }}>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider bg-muted/95 backdrop-blur-sm">
                    <th className="py-2 px-3 w-8">
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(b => selectedBills.has(b.id))}
                        onChange={() => toggleSelectAll(filtered)} className="rounded" />
                    </th>
                    <th className="py-2 px-3 font-medium">Bill No.</th>
                    <th className="py-2 px-3 font-medium">Priority</th>
                    <th className="py-2 px-3 font-medium">85</th>
                    <th className="py-2 px-3 font-medium">Title</th>
                    <th className="py-2 px-3 font-medium">Short Name</th>
                    <th className="py-2 px-3 font-medium">Senate Sponsor</th>
                    <th className="py-2 px-3 font-medium">Committee</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">P&amp;C Contact</th>
                    <th className="py-2 px-3 font-medium">Next Steps</th>
                    <th className="py-2 px-3 font-medium">Session Comments</th>
                    <th className="py-2 px-3 font-medium">Lobbyist</th>
                    <th className="py-2 px-3 font-medium">Drive Link</th>
                    <th className="py-2 px-3 font-medium">Caucus</th>
                    <th className="py-2 px-3 w-10"></th>
                  </tr>
                </thead>
                <Droppable droppableId="sections" type="section">
                  {(provided) => (
                    <tbody ref={provided.innerRef} {...provided.droppableProps}>
                      {sectionedBills.map(({ section, bills: sectionBills }, index) => (
                        <Draggable
                          key={section.id}
                          draggableId={section.id}
                          index={index}
                          isDragDisabled={false}
                        >
                          {(drag, snapshot) => (
                            <>
                              <tr ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}>
                                <td colSpan={16} className="p-0">
                                  <SectionHeaderBar
                                    section={section}
                                    billCount={sectionBills.length}
                                    expanded={expandedSections.has(section.id)}
                                    onToggle={() => toggleSection(section.id)}
                                    onUpdate={handleUpdateSection}
                                    onDelete={handleDeleteSection}
                                    dragHandleProps={drag.dragHandleProps}
                                    isDragging={snapshot.isDragging}
                                  />
                                </td>
                              </tr>
                              {expandedSections.has(section.id) && sectionBills.length === 0 && (
                                <tr>
                                  <td colSpan={16} className="text-sm text-muted-foreground py-4 px-4 text-center">No bills in this section</td>
                                </tr>
                              )}
                              {expandedSections.has(section.id) && sectionBills.map(bill => (
                                <BillRow
                                  key={bill.id} bill={bill}
                                  onUpdate={handleUpdateBill} onDelete={handleDeleteBill} isEditor={isEditor}
                                  selected={selectedBills.has(bill.id)}
                                  onToggleSelect={() => setSelectedBills(prev => { const n = new Set(prev); n.has(bill.id) ? n.delete(bill.id) : n.add(bill.id); return n; })}
                                  priorityItems={priorityItems} statusItems={statusItems}
                                  committeeItems={committeeItems} uniqueStatuses={uniqueStatuses} uniqueCommittees={uniqueCommittees}
                                />
                              ))}
                            </>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {unsectionedBills.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={16} className="px-4 py-2 bg-muted/30 border-y border-border">
                              <span className="font-semibold text-sm">Uncategorized</span>
                              <span className="ml-2 text-xs text-muted-foreground">{unsectionedBills.length} bills</span>
                            </td>
                          </tr>
                          {unsectionedBills.map(bill => (
                            <BillRow
                              key={bill.id} bill={bill}
                              onUpdate={handleUpdateBill} onDelete={handleDeleteBill} isEditor={isEditor}
                              selected={selectedBills.has(bill.id)}
                              onToggleSelect={() => setSelectedBills(prev => { const n = new Set(prev); n.has(bill.id) ? n.delete(bill.id) : n.add(bill.id); return n; })}
                              priorityItems={priorityItems} statusItems={statusItems}
                              committeeItems={committeeItems} uniqueStatuses={uniqueStatuses} uniqueCommittees={uniqueCommittees}
                            />
                          ))}
                        </>
                      )}
                    </tbody>
                  )}
                </Droppable>
              </table>
            </div>
          </div>
        </DragDropContext>
      )}

      {filtered.length > 0 && (
        <div className="text-xs text-muted-foreground px-1 py-2 flex items-center justify-between">
          <span>{filtered.length} bill{filtered.length !== 1 ? 's' : ''}</span>
          <span className="hidden md:block">Click colored badge to change · Click text cell to edit · Click bill number for full detail</span>
        </div>
      )}
    </div>
  );
}