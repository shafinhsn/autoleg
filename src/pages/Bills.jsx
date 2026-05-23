import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Search, Plus, RefreshCw, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import SectionHeaderBar from '@/components/bills/SectionHeaderBar';
import BillRow from '@/components/bills/BillRow';
import { getSectionColor } from '@/lib/bill-utils';

export default function Bills() {
  const { office, isAdmin } = useOffice();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [syncing, setSyncing] = useState(false);

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

  // Initialize all sections as expanded
  useState(() => {
    if (sections.length > 0) {
      setExpandedSections(new Set(sections.map(s => s.id)));
    }
  });

  function toggleSection(id) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Filter bills
  const filtered = bills.filter(b => {
    if (search && !b.bill_number?.toLowerCase().includes(search.toLowerCase()) &&
        !b.title?.toLowerCase().includes(search.toLowerCase()) &&
        !b.short_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && b.latest_status !== filterStatus) return false;
    if (filterSection && b.section_header !== filterSection) return false;
    return true;
  });

  // Group by section
  const sortedSections = [...sections].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sectionedBills = sortedSections.map(s => ({
    section: s,
    bills: filtered.filter(b => b.section_header === s.name),
  }));
  const unsectionedBills = filtered.filter(b => !b.section_header || !sections.find(s => s.name === b.section_header));

  const uniqueStatuses = [...new Set(bills.map(b => b.latest_status).filter(Boolean))];

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
    setSyncing(true);
    let updated = 0;
    for (const bill of bills) {
      const num = bill.bill_number?.replace(/[^0-9]/g, '');
      const prefix = bill.bill_number?.charAt(0).toUpperCase();
      if (!num) continue;

      const sessionYear = bill.session_year || 2026;
      const url = `https://legislation.nysenate.gov/api/3/bills/${sessionYear}/${bill.bill_number}?key=tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        const result = data?.result;
        if (!result) continue;

        const updateData = {};
        // Extract sponsor name - the key fix
        const sponsor = result.sponsor?.member;
        if (sponsor) {
          const sponsorName = sponsor.fullName || sponsor.shortName || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim();
          if (sponsorName) {
            updateData.senate_sponsor = sponsorName;
          }
        }

        if (result.title) updateData.title = result.title;
        if (result.status?.statusDesc) updateData.latest_status = result.status.statusDesc;
        if (result.status?.committeeName) updateData.committee = result.status.committeeName;

        // Check for same-as bill (companion)
        const sameAs = result.amendments?.items;
        if (sameAs) {
          const latestAmendment = Object.values(sameAs).pop();
          if (latestAmendment?.sameAs?.items?.[0]) {
            const companion = latestAmendment.sameAs.items[0];
            updateData.linked_senate_bill = `${companion.basePrintNo}`;
          }
        }

        if (Object.keys(updateData).length > 0) {
          await base44.entities.Bill.update(bill.id, updateData);
          updated++;
        }
      } catch (e) {
        console.log(`Sync failed for ${bill.bill_number}`, e);
      }
    }
    qc.invalidateQueries({ queryKey: ['bills'] });
    setSyncing(false);
    toast({ title: `Synced — ${updated} bill${updated !== 1 ? 's' : ''} updated` });
  }

  async function handleUpdateSection(id, data) {
    await base44.entities.SectionHeader.update(id, data);
    qc.invalidateQueries({ queryKey: ['sections'] });
  }

  async function handleDeleteSection(id) {
    if (!confirm('Delete this section header? Bills will keep their data.')) return;
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

  const BillTable = ({ bills: tableBills }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
            <th className="py-2 px-3 font-medium">Bill No.</th>
            <th className="py-2 px-3 font-medium">Short Name</th>
            <th className="py-2 px-3 font-medium">Title</th>
            <th className="py-2 px-3 font-medium">Senate Sponsor</th>
            <th className="py-2 px-3 font-medium">Committee</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Priority</th>
            <th className="py-2 px-3 font-medium">P&C Contact</th>
            <th className="py-2 px-3 font-medium">Drive</th>
            <th className="py-2 px-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {tableBills.map(bill => (
            <BillRow key={bill.id} bill={bill} onUpdate={handleUpdateBill} onDelete={handleDeleteBill} isAdmin={isAdmin} />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills Tracker</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bills..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background">
          <option value="">All Statuses</option>
          {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background">
          <option value="">All Sections</option>
          {sections.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {/* Add Bill Form */}
      {showAddForm && (
        <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
          <Input
            placeholder="Bill number (e.g. A1234)"
            value={newBillNumber}
            onChange={e => setNewBillNumber(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddBill(); }}
            className="max-w-xs text-sm"
          />
          <Button size="sm" onClick={handleAddBill}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
        </div>
      )}

      {/* Bills Grid with Sections */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {sectionedBills.map(({ section, bills: sectionBills }) => (
            <div key={section.id} className="bg-card rounded-xl border overflow-hidden">
              <SectionHeaderBar
                section={section}
                billCount={sectionBills.length}
                expanded={expandedSections.has(section.id) || expandedSections.size === 0}
                onToggle={() => toggleSection(section.id)}
                onUpdate={handleUpdateSection}
                onDelete={handleDeleteSection}
                isAdmin={isAdmin}
              />
              {(expandedSections.has(section.id) || expandedSections.size === 0) && sectionBills.length > 0 && (
                <BillTable bills={sectionBills} />
              )}
              {(expandedSections.has(section.id) || expandedSections.size === 0) && sectionBills.length === 0 && (
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
            <div className="text-center py-16 text-muted-foreground">
              <p>No bills found. Add a bill or import a CSV to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}