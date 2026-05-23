import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Plus, CheckCircle2, Circle, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

const statusConfig = {
  pending: { icon: Circle, label: 'Pending', color: 'bg-slate-100 text-slate-700' },
  in_progress: { icon: Clock, label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'bg-green-100 text-green-700' },
};

const priorityConfig = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export default function Tasks() {
  const { office } = useOffice();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', office?.id],
    queryFn: () => base44.entities.Task.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', office?.id],
    queryFn: () => base44.entities.User.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  async function handleCreate() {
    if (!form.title.trim()) return;
    await base44.entities.Task.create({ ...form, office_id: office.id, status: 'pending' });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    setForm({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' });
    setShowForm(false);
    toast({ title: 'Task created' });
  }

  async function handleStatusChange(task, newStatus) {
    await base44.entities.Task.update(task.id, { status: newStatus });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  }

  async function handleDelete(id) {
    await base44.entities.Task.delete(id);
    qc.invalidateQueries({ queryKey: ['tasks'] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Task
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <Input placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <div className="flex gap-3">
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="text-sm border rounded-md px-2.5 py-2 bg-background">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="text-sm border rounded-md px-2.5 py-2 bg-background flex-1">
                <option value="">Unassigned</option>
                {staff.map(s => <option key={s.id} value={s.email}>{s.full_name || s.email}</option>)}
              </select>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-40" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {['all', 'pending', 'in_progress', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : statusConfig[s]?.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No tasks found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const { icon: StatusIcon, label, color } = statusConfig[task.status] || statusConfig.pending;
            return (
              <Card key={task.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-start gap-3">
                  <button onClick={() => {
                    const next = task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'pending';
                    handleStatusChange(task, next);
                  }}>
                    <StatusIcon className={`w-5 h-5 mt-0.5 ${task.status === 'completed' ? 'text-green-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge className={`text-[10px] ${priorityConfig[task.priority]}`}>{task.priority}</Badge>
                      <Badge className={`text-[10px] ${color}`}>{label}</Badge>
                      {task.assigned_to && <span className="text-[10px] text-muted-foreground">→ {task.assigned_to}</span>}
                      {task.due_date && <span className="text-[10px] text-muted-foreground">Due: {task.due_date}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(task.id)} className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}