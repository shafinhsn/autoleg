import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Users, Crown, UserCheck, GraduationCap, Shield, Trash2, Copy, Mail, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

const MEMBERSHIP_ROLES = [
  { value: 'OWNER', label: 'Owner', icon: Crown, color: 'text-amber-600 bg-amber-50' },
  { value: 'ADMIN', label: 'Admin', icon: Shield, color: 'text-red-600 bg-red-50' },
  { value: 'STAFF', label: 'Staff', icon: UserCheck, color: 'text-blue-600 bg-blue-50' },
  { value: 'READ_ONLY', label: 'Viewer', icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50' },
];

function roleInfo(role) {
  return MEMBERSHIP_ROLES.find(r => r.value === role) || MEMBERSHIP_ROLES[3];
}

export default function StaffDirectory() {
  const { office, isAdmin, user } = useOffice();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('STAFF');
  const [inviting, setInviting] = useState(false);

  // Fetch all memberships for this office
  const { data: memberships = [], isLoading: loadingMemberships, refetch: refetchMemberships } = useQuery({
    queryKey: ['memberships', office?.id],
    queryFn: () => base44.entities.Membership.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  // Fetch all users referenced by memberships
  const userIds = memberships.map(m => m.user_id);
  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['membership-users', userIds.join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const results = await Promise.all(
        userIds.map(id => base44.entities.User.filter({ id }).then(r => r[0]).catch(() => null))
      );
      return results.filter(Boolean);
    },
    enabled: userIds.length > 0,
  });

  const isLoading = loadingMemberships || (userIds.length > 0 && loadingUsers);

  // Build enriched staff list: membership + user info merged
  const staff = memberships.map(mem => {
    const userRecord = allUsers.find(u => u.id === mem.user_id);
    return {
      ...userRecord,
      membershipId: mem.id,
      membershipRole: mem.role,
      userId: mem.user_id,
    };
  }).filter(s => s.userId);

  async function handleRoleChange(member, newRole) {
    await base44.entities.Membership.update(member.membershipId, { role: newRole });
    qc.invalidateQueries({ queryKey: ['memberships', office?.id] });
    toast({ title: `Updated ${member.full_name || member.email}'s role to ${newRole}` });
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.full_name || member.email} from this office?`)) return;
    await base44.entities.Membership.delete(member.membershipId);
    qc.invalidateQueries({ queryKey: ['memberships', office?.id] });
    toast({ title: `Removed ${member.full_name || member.email}` });
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Send platform invite
      await base44.users.inviteUser(inviteEmail.trim(), 'user');

      // Send email with office invite code
      await base44.functions.invoke('sendOfficeInviteEmail', {
        email: inviteEmail.trim(),
        officeName: office?.name,
        inviteCode: office?.invite_code,
        appUrl: window.location.origin,
      });

      toast({ title: `Invited ${inviteEmail}`, description: 'Login link and office invite code sent.' });
      setInviteEmail('');
    } catch (e) {
      toast({ title: 'Invite failed', description: e.message, variant: 'destructive' });
    }
    setInviting(false);
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(office?.invite_code || '');
    toast({ title: 'Invite code copied!' });
  }

  const grouped = MEMBERSHIP_ROLES.reduce((acc, r) => {
    acc[r.value] = staff.filter(s => s.membershipRole === r.value);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Directory</h1>
          <p className="text-muted-foreground text-sm">{staff.length} member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          qc.invalidateQueries({ queryKey: ['memberships', office?.id] });
          qc.invalidateQueries({ queryKey: ['membership-users'] });
        }}>
          <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Invite Section */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Invite Team Members</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                placeholder="Email address"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                type="email"
                className="flex-1 min-w-48"
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="text-sm border rounded-md px-2.5 py-2 bg-background">
                {MEMBERSHIP_ROLES.filter(r => r.value !== 'OWNER').map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                <Mail className="w-4 h-4 mr-1.5" /> {inviting ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Office Invite Code — share this to let anyone join</p>
                <p className="font-mono font-semibold tracking-wider text-lg">{office?.invite_code}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copyInviteCode}>
                <Copy className="w-4 h-4 mr-1.5" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No staff members yet</p>
            <p className="text-xs text-muted-foreground mt-1">Share the invite code above to add team members</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {MEMBERSHIP_ROLES.map(({ value, label, icon: RoleIcon }) => {
            const members = grouped[value] || [];
            if (members.length === 0) return null;
            return (
              <div key={value}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <RoleIcon className="w-4 h-4" /> {label}s ({members.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {members.map(member => {
                    const info = roleInfo(member.membershipRole);
                    const initials = (member.full_name || member.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    const isCurrentUser = member.email === user?.email;

                    return (
                      <Card key={member.membershipId} className="relative">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm flex-shrink-0">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {member.full_name || member.email || 'Unknown'}
                                {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-1">(you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                              <div className="flex items-center gap-2 mt-2">
                                {isAdmin && !isCurrentUser && member.membershipRole !== 'OWNER' ? (
                                  <select
                                    value={member.membershipRole}
                                    onChange={e => handleRoleChange(member, e.target.value)}
                                    className="text-[11px] border rounded px-1.5 py-1 bg-background"
                                  >
                                    {MEMBERSHIP_ROLES.filter(r => r.value !== 'OWNER').map(r => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                                    {info.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isAdmin && !isCurrentUser && member.membershipRole !== 'OWNER' && (
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