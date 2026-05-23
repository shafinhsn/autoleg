import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { FileText, Users, ListTodo, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

function StatCard({ title, value, icon: Icon, color, to }) {
  const Wrapper = to ? Link : 'div';
  return (
    <Wrapper to={to} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{title}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}

export default function Dashboard() {
  const { office } = useOffice();

  const { data: bills = [] } = useQuery({
    queryKey: ['bills', office?.id],
    queryFn: () => base44.entities.Bill.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', office?.id],
    queryFn: () => base44.entities.Task.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', office?.id],
    queryFn: () => base44.entities.User.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const activeBills = bills.filter(b => b.latest_status !== 'Signed into Law' && b.latest_status !== 'Vetoed');
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const recentBills = [...bills].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)).slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">{office?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Bills" value={bills.length} icon={FileText} color="bg-primary/10 text-primary" to="/bills" />
        <StatCard title="Active Bills" value={activeBills.length} icon={TrendingUp} color="bg-green-100 text-green-700" to="/bills" />
        <StatCard title="Pending Tasks" value={pendingTasks.length} icon={AlertCircle} color="bg-amber-100 text-amber-700" to="/tasks" />
        <StatCard title="Staff Members" value={staff.length} icon={Users} color="bg-blue-100 text-blue-700" to="/staff" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recently Updated Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBills.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No bills yet. Import a CSV or add bills manually.</p>
          ) : (
            <div className="space-y-2">
              {recentBills.map(bill => (
                <Link key={bill.id} to={`/bills/${bill.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-primary">{bill.bill_number}</span>
                    <span className="text-sm text-foreground truncate max-w-md">{bill.short_name || bill.title || 'Untitled'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {bill.tags?.length > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {bill.tags[0]}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{bill.latest_status || 'No status'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}