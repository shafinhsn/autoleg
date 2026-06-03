import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Save, Key, Building2, Trash2, LogOut, Users, UserPlus, Shield, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Settings() {
  const { office, isOwner, isAdmin, user, refetchOffice } = useOffice();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    branding_color: '#1e3a5f',
    senate_api_key: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('STAFF');
  const [inviting, setInviting] = useState(false);

  const { data: memberships = [], refetch: refetchMemberships } = useQuery({
    queryKey: ['memberships', office?.id],
    queryFn: () => base44.entities.Membership.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
  });

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

  async function handleLeaveOffice() {
    if (!confirm('Leave this office? You will need to rejoin or create a new one.')) return;
    
    // Delete the membership so you're not auto-logged back in
    const memberships = await base44.entities.Membership.filter({
      user_id: user.id,
      office_id: office.id,
    });
    
    if (memberships.length > 0) {
      await base44.entities.Membership.delete(memberships[0].id);
    }
    
    await base44.auth.updateMe({ active_office_id: null });
    window.location.replace('/office-setup');
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Send custom office invite email
      await base44.functions.invoke('sendOfficeInviteEmail', {
        email: inviteEmail.trim(),
        officeName: office.name,
        inviteCode: office.invite_code,
        appUrl: window.location.origin,
      });
      
      setInviteEmail('');
      setInviteRole('STAFF');
      alert(`Invitation sent to ${inviteEmail}. They can join using the invite code from the email.`);
    } catch (e) {
      console.error('Invite error:', e);
      alert('Failed to send invitation: ' + e.message);
    }
    setInviting(false);
  }

  async function handleRemoveMember(membership, memberEmail) {
    if (!confirm(`Remove ${memberEmail} from this office?`)) return;
    
    // Permission check: OWNER can remove anyone, ADMIN can remove STAFF and READ_ONLY only
    if (!isOwner && isAdmin) {
      if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
        alert('Admins can only remove Staff and Read Only users.');
        return;
      }
    }
    
    await base44.entities.Membership.delete(membership.id);
    refetchMemberships();
  }

  async function handleChangeRole(membership, newRole) {
    // Permission check: Only OWNER can change roles
    if (!isOwner) {
      alert('Only Owners can change user roles.');
      return;
    }
    
    await base44.entities.Membership.update(membership.id, { role: newRole });
    refetchMemberships();
  }

  async function handleTransferOwnership(membership) {
    if (!confirm(`Transfer ownership to ${membership.user_id}? This action cannot be undone.`)) return;
    
    // Downgrade current owner to ADMIN
    const currentMembership = memberships.find(m => m.user_id === user.id);
    if (currentMembership) {
      await base44.entities.Membership.update(currentMembership.id, { role: 'ADMIN' });
    }
    
    // Upgrade selected user to OWNER
    await base44.entities.Membership.update(membership.id, { role: 'OWNER' });
    
    console.log(`[Settings] Ownership transferred from ${user.id} to ${membership.user_id}`);
    
    refetchMemberships();
    refetchOffice();
  }

  async function handleDeleteOffice() {
    if (!isOwner) {
      alert('Only Owners can delete the office.');
      return;
    }
    
    if (!confirm(`Delete "${office.name}"? This will remove all office data including bills, tasks, and memberships. This action cannot be undone.`)) return;
    
    const confirmation = prompt('Type "DELETE" to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Office deletion cancelled.');
      return;
    }
    
    // Delete all memberships first
    for (const membership of memberships) {
      await base44.entities.Membership.delete(membership.id);
    }
    
    // Delete all bills, tasks, etc. (handled by cascade or manually)
    // For now, just delete the office
    await base44.entities.Office.delete(office.id);
    
    // Clear user's active office
    await base44.auth.updateMe({ active_office_id: null });
    
    console.log(`[Settings] Office ${office.id} deleted`);
    
    window.location.reload();
  }

  function getUserEmail(userId) {
    const u = allUsers.find(u => u.id === userId);
    return u ? u.email : userId;
  }

  function getRoleBadgeColor(role) {
    switch (role) {
      case 'OWNER': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ADMIN': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'STAFF': return 'bg-green-100 text-green-800 border-green-200';
      case 'READ_ONLY': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  // Non-admin view
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <p className="text-muted-foreground">Only Owners, Admins can manage settings.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><LogOut className="w-4 h-4" /> Switch Office</CardTitle>
            <CardDescription>Leave this office and join or create a different one</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleLeaveOffice}>
              Leave This Office
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Office Details */}
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

      {/* API Keys */}
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

      {/* Invite Code */}
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

      {/* User Management - OWNER and ADMIN only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" /> Team Members</CardTitle>
          <CardDescription>Manage office memberships and roles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite Form - OWNER and ADMIN can invite */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-2">
              <Label>Invite User by Email</Label>
              <Input 
                type="email" 
                value={inviteEmail} 
                onChange={e => setInviteEmail(e.target.value)} 
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="READ_ONLY">Read Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              <UserPlus className="w-4 h-4 mr-1.5" /> {inviting ? 'Inviting...' : 'Invite'}
            </Button>
          </div>

          {/* Members List */}
          <div className="space-y-2 mt-4">
            {memberships.map(membership => {
              const memberEmail = getUserEmail(membership.user_id);
              const isCurrentUser = membership.user_id === user.id;
              
              return (
                <div key={membership.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge className={getRoleBadgeColor(membership.role)}>{membership.role}</Badge>
                    <span className="font-medium">{memberEmail}</span>
                    {isCurrentUser && <Badge variant="outline">You</Badge>}
                    {membership.role === 'OWNER' && <Crown className="w-4 h-4 text-yellow-600" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Role Change - OWNER only */}
                    {isOwner && !isCurrentUser && (
                      <Select value={membership.role} onValueChange={(v) => handleChangeRole(membership, v)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER">Owner</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="STAFF">Staff</SelectItem>
                          <SelectItem value="READ_ONLY">Read Only</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    {/* Transfer Ownership - OWNER only, to another user */}
                    {isOwner && !isCurrentUser && membership.role !== 'OWNER' && (
                      <Button variant="outline" size="sm" onClick={() => handleTransferOwnership(membership)}>
                        <Crown className="w-3 h-3 mr-1" /> Transfer
                      </Button>
                    )}
                    
                    {/* Remove Member - OWNER can remove anyone, ADMIN can remove STAFF/READ_ONLY */}
                    {!isCurrentUser && (isOwner || (isAdmin && membership.role !== 'OWNER' && membership.role !== 'ADMIN')) && (
                      <Button variant="outline" size="sm" onClick={() => handleRemoveMember(membership, memberEmail)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Data Management
          </CardTitle>
          <CardDescription>Start fresh by clearing all imported data</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
            <a href="/clear-data">Clear All Data</a>
          </Button>
        </CardContent>
      </Card>

      {/* Delete Office - OWNER only */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              Delete Office
            </CardTitle>
            <CardDescription>Permanently delete this office and all its data</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" className="w-full" onClick={handleDeleteOffice}>
              Delete This Office
            </Button>
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><LogOut className="w-4 h-4" /> Switch Office</CardTitle>
          <CardDescription>Leave this office and join or create a different one</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleLeaveOffice}>
            Leave This Office
          </Button>
          <Button variant="outline" className="w-full" onClick={() => base44.auth.logout()}>
            Log Out (Switch Account)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}