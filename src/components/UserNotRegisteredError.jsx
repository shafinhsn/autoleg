import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Building2, LogOut, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const UserNotRegisteredError = () => {
  const [mode, setMode] = useState(null); // null | 'join'
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const offices = await base44.entities.Office.filter({ invite_code: inviteCode.trim().toUpperCase() });
      if (offices.length === 0) {
        setError('Invalid invite code. Please check and try again.');
        setLoading(false);
        return;
      }
      const office = offices[0];
      const user = await base44.auth.me();
      const existing = await base44.entities.Membership.filter({ user_id: user.id, office_id: office.id });
      if (existing.length === 0) {
        await base44.entities.Membership.create({ user_id: user.id, office_id: office.id, role: 'STAFF', full_name: user.full_name, email: user.email });
      }
      await base44.auth.updateMe({ active_office_id: office.id });
      window.location.reload();
    } catch (e) {
      setError(e.message || 'Failed to join office.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Assembly Bill Watch</h1>
          <p className="text-slate-500 mt-1 text-sm">You're signed in but not yet connected to an office.</p>
        </div>

        {mode === null && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => setMode('join')}>
              <KeyRound className="w-4 h-4 mr-2" /> Join with Invite Code
            </Button>
            <Button variant="outline" className="w-full" onClick={() => base44.auth.logout(window.location.href)}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out / Use Different Account
            </Button>
            <p className="text-xs text-center text-slate-400">
              Need access? Ask your office administrator for an invite code.
            </p>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Office Invite Code</label>
              <Input
                placeholder="Enter invite code (e.g. D2WIR7LM)"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="font-mono tracking-wider text-center text-lg"
                maxLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <Button className="w-full" onClick={handleJoin} disabled={loading || !inviteCode.trim()}>
              {loading ? 'Joining...' : 'Join Office'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => { setMode(null); setError(''); }}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserNotRegisteredError;