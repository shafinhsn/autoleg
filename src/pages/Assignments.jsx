import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Plus, Trash2, FileText, AlertTriangle, Clock, ExternalLink, Search, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

const URGENCY_CONFIG = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-700', icon: Clock },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700', icon: Clock },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function Assignments() {
  const { office, user, isAdmin } = useOffice();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [billSearch, setBillSearch] = useState('');
  const [showBillResults, setShowBillResults] = useState(false);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', due_date: '',
    urgency: 'medium', bill_id: '',
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments', office?.id],
    queryFn: () => base44.entities.Task.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', office?.id],
    queryFn: () => base44.entities.User.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['bills', office?.id],
    queryFn: () => base44.entities.Bill.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  // For staffers, only show their assignments
  const myAssignments = isAdmin
    ? assignments
    : assignments.filter(a => a.assigned_to === user?.email);

  const activeAssignments = myAssignments.filter(a => a.status !== 'completed');
  const completedAssignments = myAssignments.filter(a => a.status === 'completed');

  async function handleCreate() {
    if (!form.title.trim()) return;
    await base44.entities.Task.create({
      ...form,
      office_id: office.id,
      status: 'pending',
      priority: form.urgency === 'urgent' || form.urgency === 'high' ? 'high' : form.urgency === 'medium' ? 'medium' : 'low',
    });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    setForm({ title: '', description: '', assigned_to: '', due_date: '', urgency: 'medium', bill_id: '' });
    setBillSearch('');
    setShowForm(false);
    toast({ title: 'Assignment created' });
  }

  async function handleMarkComplete(task) {
    await base44.entities.Task.update(task.id, { status: 'completed' });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    toast({ title: 'Assignment marked as complete' });
    // For admins, switch to completed tab so they can see it
    if (isAdmin) setActiveTab('completed');
  }

  async function handleStatusChange(task, newStatus) {
    await base44.entities.Task.update(task.id, { status: newStatus });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    toast({ title: `Status updated` });
  }

  async function handleDelete(id) {
    if (!confirm('Delete this assignment?')) return;
    await base44.entities.Task.delete(id);
    qc.invalidateQueries({ queryKey: ['assignments'] });
    toast({ title: 'Assignment deleted' });
  }

  // Close bill search dropdown on outside click
  useEffect(() => {
    function handleClick() { setShowBillResults(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const urgencyOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

  function filterAndSort(list) {
    return [...list]
      .sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2))
      .filter(a => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const linkedBill = bills.find(b => b.id === a.bill_id);
        return (
          a.title?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.assigned_to?.toLowerCase().includes(q) ||
          linkedBill?.bill_number?.toLowerCase().includes(q) ||
          linkedBill?.short_name?.toLowerCase().includes(q)
        );
      });
  }

  const displayList = filterAndSort(activeTab === 'active' ? activeAssignments : completedAssignments);

  function AssignmentCard({ task, isCompleted }) {
    const urgency = URGENCY_CONFIG[task.urgency || task.priority] || URGENCY_CONFIG.medium;
    const UrgencyIcon = urgency.icon;
    const linkedBill = bills.find(b => b.id === task.bill_id);

    return (
      <Card className={`border-l-4 ${
        isCompleted ? 'border-l-green-400 opacity-80' :
        (task.urgency === 'urgent' || task.urgency === 'high') ? 'border-l-red-500' :
        task.urgency === 'medium' ? 'border-l-amber-400' : 'border-l-slate-300'
      }`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`font-semibold text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                  {task.title}
                </span>
                <Badge className={`text-[10px] ${urgency.color}`}>
                  <UrgencyIcon className="w-3 h-3 mr-1" />{urgency.label}
                </Badge>
                {isCompleted && (
                  <Badge className="text-[10px] bg-green-100 text-green-700">✓ Completed</Badge>
                )}
              </div>

              {task.description && (
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{task.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                {task.assigned_to && (
                  <span>→ <strong>{staff.find(s => s.email === task.assigned_to)?.full_name || task.assigned_to}</strong></span>
                )}
                {task.due_date && <span>📅 Due: <strong>{task.due_date}</strong></span>}
                {linkedBill && (
                  <span className="flex items-center gap-1">
                    📋 <strong>{linkedBill.bill_number}</strong>
                  </span>
                )}
                {linkedBill?.google_drive_url && (
                  <a
                    href={linkedBill.google_drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary px-2 py-1 rounded hover:bg-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Upload to Drive
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!isCompleted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-700 border-green-300 hover:bg-green-50 text-xs h-8"
                  onClick={() => handleMarkComplete(task)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete
                </Button>
              )}

              {/* Admins: restore to active or delete */}
              {isAdmin && isCompleted && (
                <button
                  onClick={() => handleStatusChange(task, 'pending')}
                  className="text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 hover:bg-muted/50 transition-colors"
                >
                  Reopen
                </button>
              )}

              {isAdmin && (
                <button onClick={() => handleDelete(task.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? 'Create and manage assignments for your team' : 'Your assigned tasks and documents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assignments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm w-52"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="w-4 h-4 mr-1.5" /> New Assignment
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Active
          {activeAssignments.length > 0 && (
            <span className="ml-2 bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {activeAssignments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Completed
          {completedAssignments.length > 0 && (
            <span className="ml-2 bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {completedAssignments.length}
            </span>
          )}
        </button>
      </div>

      {/* Create Form - Admins/Directors only */}
      {showForm && isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input placeholder="Assignment title" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Brief / Description</Label>
              <Textarea placeholder="Describe the assignment in detail..." value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Assign To</Label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full text-sm border rounded-md px-2.5 py-2 bg-background">
                  <option value="">— Select Staffer —</option>
                  {staff.map(s => <option key={s.id} value={s.email}>{s.full_name || s.email}</option>)}
                </select>
              </div>
              <div className="space-y-1 relative">
                <Label>Linked Bill</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search by bill number or name..."
                    value={billSearch}
                    onChange={e => {
                      setBillSearch(e.target.value);
                      setShowBillResults(true);
                      if (!e.target.value) setForm(f => ({ ...f, bill_id: '' }));
                    }}
                    onFocus={() => setShowBillResults(true)}
                    className="pl-8 text-sm"
                  />
                  {form.bill_id && !showBillResults && (
                    <button type="button" onClick={() => { setForm(f => ({ ...f, bill_id: '' })); setBillSearch(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
                  )}
                </div>
                {showBillResults && billSearch.trim() && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {bills
                      .filter(b => {
                        const q = billSearch.toLowerCase();
                        return b.bill_number?.toLowerCase().includes(q) || b.short_name?.toLowerCase().includes(q) || b.title?.toLowerCase().includes(q);
                      })
                      .slice(0, 20)
                      .map(b => (
                        <button key={b.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center gap-2 border-b last:border-0"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, bill_id: b.id }));
                            setBillSearch(`${b.bill_number}${b.short_name ? ` — ${b.short_name}` : ''}`);
                            setShowBillResults(false);
                          }}>
                          <span className="font-mono font-semibold text-primary">{b.bill_number}</span>
                          {b.short_name && <span className="text-muted-foreground">{b.short_name}</span>}
                        </button>
                      ))}
                    {bills.filter(b => {
                      const q = billSearch.toLowerCase();
                      return b.bill_number?.toLowerCase().includes(q) || b.short_name?.toLowerCase().includes(q) || b.title?.toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="text-sm text-muted-foreground px-3 py-2">No bills found</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Urgency</Label>
                <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
                  className="w-full text-sm border rounded-md px-2.5 py-2 bg-background">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate}>Create Assignment</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignment List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>
            {activeTab === 'active'
              ? (isAdmin ? 'No active assignments.' : 'No active assignments for you.')
              : 'No completed assignments yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map(task => (
            <AssignmentCard key={task.id} task={task} isCompleted={activeTab === 'completed'} />
          ))}
        </div>
      )}
    </div>
  );
}