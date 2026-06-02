import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { FileText, CheckCircle2, Star, Building2, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { syncBill } from '@/lib/syncBill';

const STATUS_COLORS = [
  '#3b82f6','#f97316','#10b981','#8b5cf6','#f59e0b',
  '#06b6d4','#ec4899','#84cc16','#6366f1','#ef4444',
];

function StatCard({ title, value, icon: Icon, iconColor }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-4xl font-bold mt-1">{value}</p>
          </div>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const { office } = useOffice();
  const { data: bills = [], refetch } = useQuery({
    queryKey: ['bills', office?.id],
    queryFn: () => base44.entities.Bill.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const statusText = (b) => (Array.isArray(b.latest_status) ? b.latest_status : [b.latest_status || '']).join(' ').toLowerCase();
  const inCommittee = bills.filter(b => statusText(b).includes('committee')).length;
  const passed = bills.filter(b => statusText(b).includes('passed') || statusText(b).includes('signed')).length;
  const priorityBills = bills.filter(b => b.tags?.length > 0).length;

  const committeeMap = {};
  bills.forEach(b => {
    const committees = Array.isArray(b.committee) ? b.committee : (b.committee ? [b.committee] : []);
    committees.forEach(c => { if (c) committeeMap[c] = (committeeMap[c] || 0) + 1; });
  });
  const committeeData = Object.entries(committeeMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  const statusMap = {};
  bills.forEach(b => {
    const statuses = Array.isArray(b.latest_status) ? b.latest_status : (b.latest_status ? [b.latest_status] : ['Unknown']);
    statuses.forEach(s => { statusMap[s] = (statusMap[s] || 0) + 1; });
  });
  const statusData = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  const recentBills = [...bills].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)).slice(0, 8);

  async function handleSyncAll() {
    if (bills.length === 0) return;
    setSyncing(true);
    let updated = 0;
    const apiKey = office?.senate_api_key || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
    for (const bill of bills) {
      try {
        const updateData = await syncBill(bill, apiKey);
        if (updateData) {
          await base44.entities.Bill.update(bill.id, updateData);
          updated++;
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (e) { console.error('Sync error', bill.bill_number, e); }
    }
    setSyncing(false);
    setLastSync(new Date());
    refetch();
  }

  const syncLabel = lastSync
    ? `Last synced ${Math.round((Date.now() - lastSync.getTime()) / 60000)}m ago`
    : `${bills.length} bills loaded`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{syncLabel}</p>
        </div>
        <Button onClick={handleSyncAll} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync All'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Bills" value={bills.length} icon={FileText} iconColor="text-blue-500" />
        <StatCard title="In Committee" value={inCommittee} icon={Building2} iconColor="text-blue-400" />
        <StatCard title="Passed" value={passed} icon={CheckCircle2} iconColor="text-green-500" />
        <StatCard title="Priority Bills" value={priorityBills} icon={Star} iconColor="text-yellow-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Bills by Committee</CardTitle></CardHeader>
          <CardContent>
            {committeeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No committee data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={committeeData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Bills by Status</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No status data yet</p>
            ) : (
              <div className="flex gap-4 items-center">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value">
                      {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {statusData.slice(0, 7).map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{s.name}</span>
                      </div>
                      <span className="font-medium ml-2 flex-shrink-0">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Changes</CardTitle>
          <Link to="/bills" className="text-sm text-primary hover:underline">View all bills</Link>
        </CardHeader>
        <CardContent>
          {recentBills.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No bills yet. Import a CSV or add bills manually.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentBills.map(bill => (
                <Link key={bill.id} to={`/bills/${bill.id}`} className="flex items-center justify-between py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-semibold text-primary flex-shrink-0">{bill.bill_number}</span>
                    <span className="text-sm truncate">{bill.short_name || bill.title || 'Untitled'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {bill.tags?.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{bill.tags[0]}</span>}
                    {bill.latest_status?.length > 0 && <span className="text-[11px] text-muted-foreground">{Array.isArray(bill.latest_status) ? bill.latest_status[0] : bill.latest_status}</span>}
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