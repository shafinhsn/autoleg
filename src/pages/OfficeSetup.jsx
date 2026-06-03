import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, ArrowRight, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OfficeSetup() {
  const [mode, setMode] = useState(null); // 'create' or 'join'
  const [officeName, setOfficeName] = useState('');
  const [brandingColor, setBrandingColor] = useState('#1e3a5f');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!officeName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const user = await base44.auth.me();

      // Check if user already has an office
      if (user.office_id) {
        setError('You already belong to an office. Please sign out and sign back in.');
        setLoading(false);
        return;
      }

      // Check for duplicate office name
      const existing = await base44.entities.Office.filter({ name: officeName.trim() });
      if (existing.length > 0) {
        setError('An office with this name already exists. Please choose a different name.');
        setLoading(false);
        return;
      }

      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const office = await base44.entities.Office.create({
        name: officeName.trim(),
        owner_email: user.email,
        invite_code: code,
        branding_color: brandingColor,
      });

      // Set office AND grant admin role to the creator
      await base44.auth.updateMe({ office_id: office.id, role: 'admin' });

      window.location.reload();
    } catch (e) {
      console.error('Error creating office:', e);
      setError(e.message || 'Failed to create office.');
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    try {
      const offices = await base44.entities.Office.filter({ invite_code: inviteCode.trim().toUpperCase() });
      if (offices.length === 0) {
        setLoading(false);
        setError('Invalid invite code. Please check and try again.');
        return;
      }
      const office = offices[0];
      
      // Update user's office assignment only (admin assigns role later)
      await base44.auth.updateMe({ office_id: office.id });
      
      window.location.reload();
    } catch (e) {
      console.error('Error joining office:', e);
      setError(e.message || 'Failed to join office.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Assembly Bill Watch</h1>
          <p className="text-muted-foreground mt-2">Set up your legislative office to get started</p>
        </div>

        {!mode && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              className="w-full p-6 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Create a New Office</h3>
                  <p className="text-sm text-muted-foreground">Set up your office name, branding, and invite your team</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full p-6 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <UserPlus className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Join an Existing Office</h3>
                  <p className="text-sm text-muted-foreground">Enter your invite code from your office administrator</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border p-8 space-y-6">
            <h2 className="text-xl font-semibold">Create Your Office</h2>
            <div className="space-y-2">
              <Label>Office Name</Label>
              <Input
                placeholder="e.g. Office of Assemblywoman Solages"
                value={officeName}
                onChange={e => setOfficeName(e.target.value)}
                className="text-base"
              />
            </div>
            <div className="space-y-2">
              <Label>Branding Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandingColor}
                  onChange={e => setBrandingColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{brandingColor}</span>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setMode(null); setError(''); }} disabled={loading}>Back</Button>
              <Button onClick={handleCreate} disabled={loading || !officeName.trim()} className="flex-1">
                {loading ? 'Creating...' : 'Create Office'}
              </Button>
            </div>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border p-8 space-y-6">
            <h2 className="text-xl font-semibold">Join an Office</h2>
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <Input
                placeholder="Enter your invite code"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="text-base font-mono tracking-wider text-center"
                maxLength={8}
              />
            </div>
            {error && mode === 'join' && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setMode(null); setError(''); }} disabled={loading}>Back</Button>
              <Button onClick={handleJoin} disabled={loading || !inviteCode.trim()} className="flex-1">
                {loading ? 'Joining...' : 'Join Office'}
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}