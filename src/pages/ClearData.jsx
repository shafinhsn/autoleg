import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, AlertTriangle } from 'lucide-react';

export default function ClearData() {
  const { office, isAdmin } = useOffice();
  const qc = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">Clear Data</h1>
        <p className="text-muted-foreground">Only admin users can access this page.</p>
      </div>
    );
  }

  async function handleClear() {
    if (!confirm('This will delete ALL bills, sections, and tracker configurations. This cannot be undone. Are you sure?')) return;
    if (!confirm('Seriously, all data will be permanently deleted. Continue?')) return;

    setClearing(true);
    try {
      // Delete all bills
      const bills = await base44.entities.Bill.filter({ office_id: office.id });
      for (const bill of bills) {
        await base44.entities.Bill.delete(bill.id);
      }

      // Delete all sections
      const sections = await base44.entities.SectionHeader.filter({ office_id: office.id });
      for (const section of sections) {
        await base44.entities.SectionHeader.delete(section.id);
      }

      // Delete all tracker configs
      const configs = await base44.entities.TrackerConfig.filter({ office_id: office.id });
      for (const config of configs) {
        await base44.entities.TrackerConfig.delete(config.id);
      }

      setResult({ success: true, billsDeleted: bills.length, sectionsDeleted: sections.length, configsDeleted: configs.length });
      qc.invalidateQueries({ queryKey: ['bills', office?.id] });
      qc.invalidateQueries({ queryKey: ['sections', office?.id] });
      qc.invalidateQueries({ queryKey: ['tracker-config', office?.id] });
    } catch (e) {
      console.error('Clear error:', e);
      setResult({ success: false, error: e.message });
    }
    setClearing(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clear All Data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Start fresh by removing all bills, sections, and configurations.
        </p>
      </div>

      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Warning: This Action Cannot Be Undone
          </CardTitle>
          <CardDescription>
            All bills, section headers, and tracker configurations will be permanently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={clearing}
            className="w-full"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {clearing ? 'Clearing...' : 'Delete All Data'}
          </Button>

          {result && (
            <div className={`mt-4 p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
              {result.success ? (
                <div>
                  <p className="font-semibold">Data cleared successfully!</p>
                  <p className="text-sm mt-1">
                    {result.billsDeleted} bills · {result.sectionsDeleted} sections · {result.configsDeleted} configurations deleted
                  </p>
                  <p className="text-sm mt-2">You can now import your Excel spreadsheet with clean data.</p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold">Error occurred</p>
                  <p className="text-sm">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}