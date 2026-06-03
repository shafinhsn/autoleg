import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, ArrowRight, UserPlus, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OfficeSetup() {
  const [mode, setMode] = useState(null); // null | 'select' | 'create' | 'join'
  const [offices, setOffices] = useState([]);
  const [loadingOffices, setLoadingOffices] = useState(false);
  const [officeName, setOfficeName] = useState('');
  const [brandingColor, setBrandingColor] = useState('#1e3a5f');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // On mount: check if user has memberships or is creator of any office
  useEffect(() => {
    autoFixAndLoadOffices();
  }, []);

  async function autoFixAndLoadOffices() {
    setLoadingOffices(true);
    try {
      const user = await base44.auth.me();

      // If user already has an active_office_id, they're set — reload
      if (user.active_office_id) {
        window.location.reload();
        return;
      }

      // Find all offices where this user is the creator
      const ownedOffices = await base44.entities.Office.filter({ creator_id: user.id });

      if (ownedOffices.length === 1) {
        // Only one owned office — ensure membership exists and auto-assign
        const office = ownedOffices[0];
        
        // Check if membership exists
        const memberships = await base44.entities.Membership.filter({
          user_id: user.id,
          office_id: office.id,
        });
        
        if (memberships.length === 0) {
          // Create OWNER membership
          await base44.entities.Membership.create({
            user_id: user.id,
            office_id: office.id,
            role: 'OWNER',
          });
        }
        
        // Set active office
        await base44.auth.updateMe({ active_office_id: office.id });
        window.location.reload();
        return;
      }

      if (ownedOffices.length > 1) {
        // Multiple owned offices — let them pick
        setOffices(ownedOffices);
        setMode('select');
      } else {
        // No owned offices — show the normal create/join screen
        setMode(null);
      }
    } catch (e) {
      console.error('Auto-fix check failed:', e);
      setMode(null);
    }
    setLoadingOffices(false);
  }

  async function handleSelectOffice(office) {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      
      // Ensure membership exists
      const memberships = await base44.entities.Membership.filter({
        user_id: user.id,
        office_id: office.id,
      });
      
      if (memberships.length === 0) {
        await base44.entities.Membership.create({
          user_id: user.id,
          office_id: office.id,
          role: 'OWNER',
        });
      }
      
      await base44.auth.updateMe({ active_office_id: office.id });
      window.location.reload();
    } catch (e) {
      setError(e.message || 'Failed to select office.');
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!officeName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const user = await base44.auth.me();

      // Check for duplicate office name
      const existing = await base44.entities.Office.filter({ name: officeName.trim() });
      if (existing.length > 0) {
        setError('An office with this name already exists. Please choose a different name.');
        setLoading(false);
        return;
      }

      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      // Requirement 2: Create office with creator_id
      const office = await base44.entities.Office.create({
        name: officeName.trim(),
        creator_id: user.id,
        invite_code: code,
        branding_color: brandingColor,
      });

      console.log('[OfficeSetup] Office created:', office.id);
      console.log('[OfficeSetup] Creator ID:', user.id);

      // Requirement 2: Automatically create membership record for creator with OWNER role
      const membership = await base44.entities.Membership.create({
        user_id: user.id,
        office_id: office.id,
        role: 'OWNER',
      });

      console.log('[OfficeSetup] Membership created:', membership.id, 'Role: OWNER');

      // Requirement 2: Set the newly created office as the user's active office
      await base44.auth.updateMe({ active_office_id: office.id });
      
      console.log('[OfficeSetup] User active_office_id set to:', office.id);
      
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
    setError('');
    try {
      const user = await base44.auth.me();
      const offices = await base44.entities.Office.filter({ invite_code: inviteCode.trim().toUpperCase() });
      
      if (offices.length === 0) {
        setLoading(false);
        setError('Invalid invite code. Please check and try again.');
        return;
      }
      
      const office = offices[0];
      
      // Requirement 4: Check if already a member
      const existingMembership = await base44.entities.Membership.filter({
        user_id: user.id,
        office_id: office.id,
      });
      
      if (existingMembership.length > 0) {
        setError('You are already a member of this office.');
        setLoading(false);
        return;
      }
      
      // Requirement 4: Joining creates a membership record with role assigned by invitation
      // For invite code joining, default to STAFF role (can be customized later)
      await base44.entities.Membership.create({
        user_id: user.id,
        office_id: office.id,
        role: 'STAFF',
      });
      
      console.log('[OfficeSetup] User joined office via invite code:', office.id);
      console.log('[OfficeSetup] Membership created with role: STAFF');
      
      // Set active office
      await base44.auth.updateMe({ active_office_id: office.id });
      window.location.reload();
    } catch (e) {
      console.error('Error joining office:', e);
      setError(e.message || 'Failed to join office.');
      setLoading(false);
    }
  }

  if (loadingOffices) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Assembly Bill Watch</h1>
          <p className="text-muted-foreground mt-2">Set up your legislative office to get started</p>
        </div>

        {/* SELECT existing owned offices */}
        {mode === 'select' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border p-8 space-y-4">
            <h2 className="text-xl font-semibold">Select Your Office</h2>
            <p className="text-sm text-muted-foreground">We found offices associated with your account. Select one to continue.</p>
            {offices.map(office => (
              <button
                key={office.id}
                onClick={() => handleSelectOffice(office)}
                disabled={loading}
                className="w-full p-4 rounded-xl border-2 border-border bg-background hover:border-primary/50 transition-all text-left flex items-center gap-4 group"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: office.branding_color || '#1e3a5f' }}>
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{office.name}</p>
                  <p className="text-xs text-muted-foreground">Owner</p>
                </div>
                <CheckCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
            <Button variant="outline" className="w-full" onClick={() => setMode(null)}>Create or Join a Different Office</Button>
          </motion.div>
        )}

        {/* MAIN CHOICE */}
        {mode === null && (
          <div className="space-y-4">
            <button onClick={() => setMode('create')} className="w-full p-6 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left group">
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

            <button onClick={() => setMode('join')} className="w-full p-6 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left group">
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

        {/* CREATE */}
        {mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border p-8 space-y-6">
            <h2 className="text-xl font-semibold">Create Your Office</h2>
            <div className="space-y-2">
              <Label>Office Name</Label>
              <Input placeholder="e.g. Office of Assemblywoman Solages" value={officeName}
                onChange={e => setOfficeName(e.target.value)} className="text-base" />
            </div>
            <div className="space-y-2">
              <Label>Branding Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={brandingColor} onChange={e => setBrandingColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border cursor-pointer" />
                <span className="text-sm text-muted-foreground">{brandingColor}</span>
              </div>
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setMode(null); setError(''); }} disabled={loading}>Back</Button>
              <Button onClick={handleCreate} disabled={loading || !officeName.trim()} className="flex-1">
                {loading ? 'Creating...' : 'Create Office'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* JOIN */}
        {mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border p-8 space-y-6">
            <h2 className="text-xl font-semibold">Join an Office</h2>
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <Input placeholder="Enter your invite code" value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="text-base font-mono tracking-wider text-center" maxLength={8} />
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
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