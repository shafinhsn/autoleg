import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Users, Crown, UserCheck, GraduationCap, Shield, Trash2, Copy, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

const ROLES = [
  { value: 'OWNER', label: 'Owner', icon: Crown, color: 'text-amber-600 bg-amber-50' },
  { value: 'ADMIN', label: 'Admin', icon: Shield, color: 'text-red-600 bg-red-50' },
  { value: 'STAFF', label: 'Staff', icon: UserCheck, color: 'text-blue-600 bg-blue-50' },
  { value: 'READ_ONLY', label: 'Read Only', icon: GraduationCap, color: 'text-gray-600 bg-gray-50' },
];

function roleInfo(role) {
  return ROLES.find(r => r.value === role) || ROLES[3];
}

export default function StaffDirectory() {
  const { office, isAdmin, user } = useOffice();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staffer');
  const [inviting, setInviting] = useState(false);

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ['memberships', office?.id],
    queryFn: () => base44.entities.Membership.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  // Build staff list directly from memberships (email/full_name cached on membership)
  const staff = memberships.map(m => ({
    id: m.user_id,
    membershipId: m.id,
    membershipRole: m.role,
    full_name: m.full_name || m.email || 'Unknown',
    email: m.email || '',
  }));

  const pendingInvites = [];

  async function handleRoleChange(member, newRole) {
    await base44.entities.Membership.update(member.membershipId, { role: newRole });
    qc.invalidateQueries({ queryKey: ['memberships', office?.id] });
    toast({ title: `Updated ${member.full_name}'s role` });
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.full_name || member.email} from this office? They will no longer have access.`)) return;
    await base44.entities.Membership.delete(member.membershipId);
    qc.invalidateQueries({ queryKey: ['memberships', office?.id] });
    toast({ title: `Removed ${member.full_name || member.email}` });
  }

  async function handleCancelInvite(invite) {
    if (!confirm(`Cancel invite for ${invite.email}?`)) return;
    await base44.entities.User.delete(invite.id);
    qc.invalidateQueries({ queryKey: ['all-users'] });
    toast({ title: 'Invite cancelled' });
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Check if user already exists
      const existingUsers = await base44.entities.User.filter({ email: inviteEmail.trim() });
      if (existingUsers.length > 0 && existingUsers[0].office_id) {
        toast({ title: 'User already in office', description: `${inviteEmail} is already a member.`, variant: 'destructive' });
        setInviting(false);
        return;
      }
      
      // Invite the user to the platform (sends login email)
      await base44.users.inviteUser(inviteEmail.trim(), 'user');
      
      // If user record doesn't exist, create a pending invite record
      if (existingUsers.length === 0) {
        await base44.entities.User.create({
          email: inviteEmail.trim(),
          role: 'user',
          is_active: false,
          office_id: null,
        });
      }
      
      // Also send them the office invite code so they know how to join
      await base44.integrations.Core.SendEmail({
        to: inviteEmail.trim(),
        subject: `You've been invited to join ${office?.name}`,
        body: `Hi,\n\nYou've been invited to join ${office?.name} on Assembly Bill Watch.\n\n` +
          `Step 1: Log in at the link sent to you by the platform.\n` +
          `Step 2: When prompted, select "Join an Existing Office" and enter this invite code:\n\n` +
          `  ${office?.invite_code}\n\n` +
          `You'll then have access to the office's bill tracker and team tools.\n\n` +
          `Questions? Reply to this email or contact your office administrator.`,
      });
      toast({ title: `Invited ${inviteEmail}`, description: 'Login link + office code sent.' });
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['all-users'] });
    } catch (e) {
      toast({ title: 'Invite failed', description: e.message, variant: 'destructive' });
    }
    setInviting(false);
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(office?.invite_code || '');
    toast({ title: 'Invite code copied!' });
  }

  const grouped = {
    OWNER: staff.filter(s => s.membershipRole === 'OWNER'),
    ADMIN: staff.filter(s => s.membershipRole === 'ADMIN'),
    STAFF: staff.filter(s => s.membershipRole === 'STAFF'),
    READ_ONLY: staff.filter(s => s.membershipRole === 'READ_ONLY'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Directory</h1>
          <p className="text-muted-foreground text-sm">{staff.length} member{staff.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Pending Invites */}
      {isAdmin && pendingInvites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pending Invites</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">Invited, waiting to join</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    await base44.integrations.Core.SendEmail({
                      to: invite.email,
                      subject: `Reminder: Join ${office?.name}`,
                      body: `Hi,\n\nThis is a reminder to join ${office?.name} on Assembly Bill Watch.\n\n` +
                        `Use this invite code: ${office?.invite_code}\n\n` +
                        `Log in and select "Join an Existing Office" to get started.`,
                    });
                    toast({ title: 'Reminder sent', description: `Email sent to ${invite.email}` });
                  }}>Resend</Button>
                  <Button variant="outline" size="sm" onClick={() => handleCancelInvite(invite)}>Cancel</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Invite Section */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Invite Team Members</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Input
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  type="email"
                  className="flex-1"
                />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                <Mail className="w-4 h-4 mr-1.5" /> {inviting ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Office Invite Code</p>
                <p className="font-mono font-semibold tracking-wider text-lg">{office?.invite_code}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copyInviteCode}>
                <Copy className="w-4 h-4 mr-1.5" /> Copy Code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No staff members yet</p>
            <p className="text-xs text-muted-foreground mt-1">Share the invite code to add team members</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {ROLES.map(({ value, label, icon: RoleIcon }) => {
            const members = grouped[value] || [];
            // Use membershipRole for the role badge

            if (members.length === 0) return null;
            return (
              <div key={value}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <RoleIcon className="w-4 h-4" /> {label}s ({members.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {members.map(member => {
                    const info = roleInfo(member.membershipRole);
                    const RoleIcon = info.icon;
                    const initials = (member.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    const isCurrentUser = member.email === user?.email;

                    return (
                      <Card key={member.id} className="relative">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm flex-shrink-0">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {member.full_name || 'Unknown'}
                                {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-1">(you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                              {member.title && <p className="text-xs text-muted-foreground mt-0.5">{member.title}</p>}
                              <div className="flex items-center gap-2 mt-2">
                                {isAdmin && !isCurrentUser && member.membershipRole !== 'OWNER' ? (
                                  <select
                                    value={member.membershipRole}
                                    onChange={e => handleRoleChange(member, e.target.value)}
                                    className="text-[11px] border rounded px-1.5 py-1 bg-background"
                                  >
                                    {ROLES.filter(r => r.value !== 'OWNER').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                  </select>
                                ) : (
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                                    {info.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isAdmin && !isCurrentUser && (
                              <button onClick={() => handleRemove(member)} className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}