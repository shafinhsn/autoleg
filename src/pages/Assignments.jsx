import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Plus, Trash2, Upload, FileText, AlertTriangle, Clock, CheckCircle2, ExternalLink } from 'lucide-react';
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

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
};

export default function Assignments() {
  const { office, user, isAdmin } = useOffice();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);
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
    setShowForm(false);
    toast({ title: 'Assignment created' });
  }

  async function handleStatusChange(task, newStatus) {
    await base44.entities.Task.update(task.id, { status: newStatus });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    toast({ title: `Marked as ${STATUS_CONFIG[newStatus]?.label}` });
  }

  async function handleDelete(id) {
    if (!confirm('Delete this assignment?')) return;
    await base44.entities.Task.delete(id);
    qc.invalidateQueries({ queryKey: ['assignments'] });
    toast({ title: 'Assignment deleted' });
  }

  async function handleDocUpload(e, task) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFor(task.id);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    // If linked bill has a google drive URL, note it. Otherwise store doc link.
    const linkedBill = bills.find(b => b.id === task.bill_id);
    const notes = task.internal_notes || '';
    const newNote = `\n📎 [${file.name}](${file_url}) — uploaded ${new Date().toLocaleDateString()}`;
    await base44.entities.Task.update(task.id, { description: (task.description || '') + newNote });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    setUploadingFor(null);
    toast({
      title: 'Document uploaded',
      description: linkedBill?.google_drive_url
        ? 'Also upload to the linked Google Drive folder manually.'
        : 'File link saved to assignment.',
    });
  }

  const urgencyOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...myAssignments].sort((a, b) =>
    (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? 'Create and manage assignments for your team' : 'Your assigned tasks and documents'}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Assignment
          </Button>
        )}
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
              <div className="space-y-1">
                <Label>Linked Bill</Label>
                <select value={form.bill_id} onChange={e => setForm(f => ({ ...f, bill_id: e.target.value }))}
                  className="w-full text-sm border rounded-md px-2.5 py-2 bg-background">
                  <option value="">— None —</option>
                  {bills.map(b => <option key={b.id} value={b.id}>{b.bill_number} {b.short_name ? `- ${b.short_name}` : ''}</option>)}
                </select>
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
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{isAdmin ? 'No assignments yet. Create one above.' : 'No assignments for you yet.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(task => {
            const urgency = URGENCY_CONFIG[task.urgency || task.priority] || URGENCY_CONFIG.medium;
            const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const UrgencyIcon = urgency.icon;
            const linkedBill = bills.find(b => b.id === task.bill_id);

            return (
              <Card key={task.id} className={`border-l-4 ${
                (task.urgency === 'urgent' || task.urgency === 'high') ? 'border-l-red-500' :
                task.urgency === 'medium' ? 'border-l-amber-400' : 'border-l-slate-300'
              }`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{task.title}</span>
                        <Badge className={`text-[10px] ${urgency.color}`}>
                          <UrgencyIcon className="w-3 h-3 mr-1" />{urgency.label}
                        </Badge>
                        <Badge className={`text-[10px] ${status.color}`}>{status.label}</Badge>
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
                            {linkedBill.google_drive_url && (
                              <a href={linkedBill.google_drive_url} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-0.5 ml-1">
                                <ExternalLink className="w-3 h-3" /> Drive
                              </a>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Doc upload for staffer */}
                      <label className="cursor-pointer">
                        <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                          onChange={e => handleDocUpload(e, task)} />
                        <span className="inline-flex items-center gap-1 text-xs text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/5 transition-colors">
                          {uploadingFor === task.id ? (
                            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          Upload Doc
                        </span>
                      </label>

                      {/* Status change */}
                      <select value={task.status}
                        onChange={e => handleStatusChange(task, e.target.value)}
                        className="text-xs border rounded px-1.5 py-1 bg-background">
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>

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
          })}
        </div>
      )}
    </div>
  );
}