import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Save, Key, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Settings() {
  const { office, isAdmin, refetchOffice } = useOffice();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    branding_color: '#1e3a5f',
    senate_api_key: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (office) {
      setForm({
        name: office.name || '',
        branding_color: office.branding_color || '#1e3a5f',
        senate_api_key: office.senate_api_key || '',
      });
    }
  }, [office]);

  async function handleSave() {
    setSaving(true);
    await base44.entities.Office.update(office.id, form);
    refetchOffice();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Only admins and directors can manage settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Building2 className="w-4 h-4" /> Office Details</CardTitle>
          <CardDescription>Configure your office name and branding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Office Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Branding Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.branding_color} onChange={e => setForm(f => ({ ...f, branding_color: e.target.value }))} className="w-10 h-10 rounded-lg border cursor-pointer" />
              <span className="text-sm text-muted-foreground font-mono">{form.branding_color}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Key className="w-4 h-4" /> API Keys</CardTitle>
          <CardDescription>Configure external service API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>NY Senate Open Legislation API Key</Label>
            <Input
              type="password"
              value={form.senate_api_key}
              onChange={e => setForm(f => ({ ...f, senate_api_key: e.target.value }))}
              placeholder="Enter your NY Senate API key"
            />
            <p className="text-xs text-muted-foreground">
              Used to sync bill data, sponsors, and committee info. Get a key at{' '}
              <a href="https://legislation.nysenate.gov/static/docs/html/index.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">legislation.nysenate.gov</a>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite Code</CardTitle>
          <CardDescription>Share this code with new team members to join your office</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
            <p className="font-mono font-bold text-2xl tracking-widest">{office?.invite_code}</p>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(office?.invite_code || '')}>
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  );
}