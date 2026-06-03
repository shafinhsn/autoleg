import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Pencil, Zap, GitBranch, MessageSquare } from 'lucide-react';

const EVENT_CONFIG = {
  api_sync: { label: 'API Sync', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
  manual_edit: { label: 'Manual Edit', icon: Pencil, color: 'text-amber-600', bg: 'bg-amber-50' },
  status_update: { label: 'Status Update', icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50' },
  milestone_added: { label: 'Milestone', icon: GitBranch, color: 'text-green-600', bg: 'bg-green-50' },
  field_change: { label: 'Field Change', icon: Pencil, color: 'text-amber-600', bg: 'bg-amber-50' },
  comment_added: { label: 'Comment', icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-50' },
};

export default function ChangeLog({ billId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['changelog', billId],
    queryFn: () => base44.entities.BillChangeLog.filter({ bill_id: billId }, '-created_date', 100),
    enabled: !!billId,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No activity logged yet. Changes and syncs will appear here.</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4 pl-10">
        {logs.map(log => {
          const config = EVENT_CONFIG[log.event_type] || EVENT_CONFIG.field_change;
          const Icon = config.icon;
          return (
            <div key={log.id} className="relative">
              <div className={`absolute -left-[2.35rem] w-7 h-7 rounded-full flex items-center justify-center ${config.bg} border-2 border-background`}>
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>
              <div className="bg-card border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-foreground">{log.description}</p>
                {log.old_value && log.new_value && (
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded line-through">{log.old_value}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{log.new_value}</span>
                  </div>
                )}
                {log.changed_by && (
                  <p className="text-[10px] text-muted-foreground mt-1">by {log.changed_by}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}