import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Search, Plus, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import SectionHeaderBar from '@/components/bills/SectionHeaderBar';
import BillRow from '@/components/bills/BillRow.jsx';
import { getSectionColor } from '@/lib/bill-utils';
import { Link } from 'react-router-dom';

export default function Bills() {
  const { office, isAdmin } = useOffice();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCommittee, setFilterCommittee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [selectedBills, setSelectedBills] = useState(new Set());

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

  const filtered = bills.filter(b => {
    if (search && !b.bill_number?.toLowerCase().includes(search.toLowerCase()) &&
        !b.title?.toLowerCase().includes(search.toLowerCase()) &&
        !b.short_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && b.latest_status !== filterStatus) return false;
    if (filterCommittee && b.committee !== filterCommittee) return false;
    if (filterPriority && !(b.tags || []).includes(filterPriority)) return false;
    return true;
  });

  const sortedSections = [...sections].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sectionedBills = sortedSections.map(s => ({
    section: s,
    bills: filtered.filter(b => b.section_header === s.name),
  }));
  const unsectionedBills = filtered.filter(b => !b.section_header || !sections.find(s => s.name === b.section_header));

  const uniqueStatuses = [...new Set(bills.map(b => b.latest_status).filter(Boolean))].sort();
  const uniqueCommittees = [...new Set(bills.map(b => b.committee).filter(Boolean))].sort();
  const uniquePriorities = priorityConfigs[0]?.items?.map(i => i.label) ||
    [...new Set(bills.flatMap(b => b.tags || []).filter(Boolean))];

  async function handleAddBill() {
    if (!newBillNumber.trim()) return;
    await base44.entities.Bill.create({
      bill_number: newBillNumber.trim().toUpperCase(),
      office_id: office.id,
      chamber: newBillNumber.trim().toUpperCase().startsWith('S') ? 'Senate' : 'Assembly',
      session_year: 2026,
      tags: [],
    });
    qc.invalidateQueries({ queryKey: ['bills'] });
    setNewBillNumber('');
    setShowAddForm(false);
    toast({ title: `Added ${newBillNumber.trim().toUpperCase()}` });
  }

  async function handleUpdateBill(id, data) {
    // If tags changed, auto-assign section_header and ensure section exists
    if (data.tags !== undefined) {
      const firstTag = Array.isArray(data.tags) ? data.tags[0] : data.tags;
      if (firstTag) {
        data.section_header = firstTag;
        // Create section header if it doesn't exist
        const existingSection = sections.find(s => s.name === firstTag);
        if (!existingSection) {
          await base44.entities.SectionHeader.create({
            office_id: office.id,
            name: firstTag,
            color: getSectionColor(firstTag),
            sort_order: sections.length,
          });
          qc.invalidateQueries({ queryKey: ['sections'] });
        }
      } else {
        data.section_header = '';
      }
    }
    await base44.entities.Bill.update(id, data);
    qc.invalidateQueries({ queryKey: ['bills'] });
  }

  async function handleDeleteBill(id, billNumber) {
    if (!confirm(`Remove ${billNumber} from tracker?`)) return;
    await base44.entities.Bill.delete(id);
    qc.invalidateQueries({ queryKey: ['bills'] });
    toast({ title: `Removed ${billNumber}` });
  }

  async function handleSync() {
    if (bills.length === 0) {
      toast({ title: 'No bills to sync. Add bills first.' });
      return;
    }
    setSyncing(true);
    let updated = 0;
    const apiKey = office?.senate_api_key || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
    for (const bill of bills) {
      const billNum = bill.bill_number?.trim().toUpperCase();
      if (!billNum) continue;
      const year = bill.session_year || 2026;
      const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        const result = data?.result;
        if (!result) continue;
        const updateData = {};

        // Title
        if (result.title) updateData.title = result.title;

        // Primary sponsor — correctly extract from primarySponsor or sponsor
        const primarySponsor = result.sponsor?.member || result.primarySponsor?.member;
        if (primarySponsor) {
          const firstName = primarySponsor.firstName || '';
          const lastName = primarySponsor.lastName || '';
          const fullName = primarySponsor.fullName || `${firstName} ${lastName}`.trim();
          if (fullName) {
            if (billNum.startsWith('S')) {
              updateData.senate_sponsor = fullName;
            } else {
              updateData.assembly_sponsor = fullName;
              // Also set senate sponsor if there's a same-as
            }
          }
        }

        // Status
        if (result.status?.statusDesc) updateData.latest_status = result.status.statusDesc;
        if (result.status?.committeeName) updateData.committee = result.status.committeeName;

        // Same-as / companion bill
        const amendments = result.amendments?.items;
        if (amendments) {
          const latestAmend = Object.values(amendments).pop();
          const sameAs = latestAmend?.sameAs?.items;
          if (sameAs && sameAs.length > 0) {
            updateData.linked_senate_bill = sameAs[0].basePrintNo;
            // Try to get senate sponsor from the companion
          }
          // Assembly sponsor from co-sponsors
          if (!updateData.assembly_sponsor && latestAmend?.coSponsors?.items?.length > 0) {
            const co = latestAmend.coSponsors.items[0];
            if (co.fullName || co.lastName) {
              updateData.assembly_sponsor = co.fullName || `${co.firstName || ''} ${co.lastName}`.trim();
            }
          }
        }

        // Hearing date from actions
        const actions = result.actions?.items || [];
        const hearingAction = actions.find(a =>
          /hearing|committee|floor/i.test(a.text || '')
        );
        if (hearingAction?.date) {
          updateData.hearing_date = hearingAction.date.split('T')[0];
        }

        if (Object.keys(updateData).length > 0) {
          await base44.entities.Bill.update(bill.id, updateData);
          updated++;
        }
      } catch (e) {
        console.error(`Failed to sync ${bill.bill_number}:`, e);
      }
    }
    qc.invalidateQueries({ queryKey: ['bills'] });
    setSyncing(false);
    toast({ title: `Synced — ${updated} of ${bills.length} bill${bills.length !== 1 ? 's' : ''} updated` });
  }

  async function handleUpdateSection(id, data) {
    await base44.entities.SectionHeader.update(id, data);
    qc.invalidateQueries({ queryKey: ['sections'] });
  }

  async function handleDeleteSection(id) {
    if (!confirm('Delete this section header?')) return;
    await base44.entities.SectionHeader.delete(id);
    qc.invalidateQueries({ queryKey: ['sections'] });
  }

  async function addSection() {
    const name = prompt('Section name (e.g. TOP 5 PRIORITY):');
    if (!name?.trim()) return;
    await base44.entities.SectionHeader.create({
      office_id: office.id,
      name: name.trim().toUpperCase(),
      color: getSectionColor(name.trim().toUpperCase()),
      sort_order: sections.length,
    });
    qc.invalidateQueries({ queryKey: ['sections'] });
  }

  function toggleSelectAll(billsList) {
    const allSelected = billsList.every(b => selectedBills.has(b.id));
    setSelectedBills(prev => {
      const next = new Set(prev);
      billsList.forEach(b => allSelected ? next.delete(b.id) : next.add(b.id));
      return next;
    });
  }

  const BillTable = ({ bills: tableBills }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
            <th className="py-2 px-3 w-8">
              <input type="checkbox"
                checked={tableBills.length > 0 && tableBills.every(b => selectedBills.has(b.id))}
                onChange={() => toggleSelectAll(tableBills)} className="rounded" />
            </th>
            <th className="py-2 px-3 font-medium">Bill No.</th>
            <th className="py-2 px-3 font-medium">Short Name</th>
            <th className="py-2 px-3 font-medium">Title</th>
            <th className="py-2 px-3 font-medium">Senate Sponsor</th>
            <th className="py-2 px-3 font-medium">Committee</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Priority</th>
            <th className="py-2 px-3 font-medium">P&amp;C Contact</th>
            <th className="py-2 px-3 font-medium">Drive</th>
            <th className="py-2 px-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {tableBills.map(bill => (
            <BillRow
              key={bill.id}
              bill={bill}
              onUpdate={handleUpdateBill}
              onDelete={handleDeleteBill}
              isAdmin={isAdmin}
              selected={selectedBills.has(bill.id)}
              onToggleSelect={() => setSelectedBills(prev => { const n = new Set(prev); n.has(bill.id) ? n.delete(bill.id) : n.add(bill.id); return n; })}
              priorityItems={priorityConfigs[0]?.items}
              statusItems={statusConfigs[0]?.items}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

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
              for (const id of selectedBills) await base44.entities.Bill.delete(id);
              setSelectedBills(new Set());
              qc.invalidateQueries({ queryKey: ['bills'] });
              toast({ title: `Deleted ${selectedBills.size} bill(s)` });
            }}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete {selectedBills.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/import"><Upload className="w-4 h-4 mr-1.5" /> Import</Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="w-4 h-4 mr-1.5" /> Section
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
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
          <Button size="sm" onClick={handleAddBill}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {sectionedBills.map(({ section, bills: sectionBills }) => (
            <div key={section.id} className="bg-card rounded-xl border overflow-hidden">
              <SectionHeaderBar
                section={section} billCount={sectionBills.length}
                expanded={expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
                onUpdate={handleUpdateSection} onDelete={handleDeleteSection} isAdmin={isAdmin}
              />
              {expandedSections.has(section.id) && sectionBills.length > 0 && <BillTable bills={sectionBills} />}
              {expandedSections.has(section.id) && sectionBills.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 px-4 text-center">No bills in this section</p>
              )}
            </div>
          ))}
          {unsectionedBills.length > 0 && (
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 font-semibold text-sm border-b">
                <span>Uncategorized</span>
                <span className="text-xs font-normal text-muted-foreground">{unsectionedBills.length} bills</span>
              </div>
              <BillTable bills={unsectionedBills} />
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">No bills found. Add a bill or import a CSV.</div>
          )}
        </div>
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