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
  { value: 'admin', label: 'Admin', icon: Shield, color: 'text-red-600 bg-red-50' },
  { value: 'legislative_director', label: 'Legislative Director', icon: Crown, color: 'text-amber-600 bg-amber-50' },
  { value: 'staffer', label: 'General Staffer', icon: UserCheck, color: 'text-blue-600 bg-blue-50' },
  { value: 'intern', label: 'Intern', icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50' },
];

function roleInfo(role) {
  return ROLES.find(r => r.value === role) || ROLES[2];
}

export default function StaffDirectory() {
  const { office, isAdmin, user } = useOffice();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staffer');
  const [inviting, setInviting] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', office?.id],
    queryFn: () => base44.entities.User.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  async function handleRoleChange(member, newRole) {
    await base44.entities.User.update(member.id, { role: newRole });
    qc.invalidateQueries({ queryKey: ['staff'] });
    toast({ title: `Updated ${member.full_name}'s role` });
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.full_name || member.email} from this office? They will no longer have access.`)) return;
    await base44.entities.User.update(member.id, { office_id: '', is_active: false });
    qc.invalidateQueries({ queryKey: ['staff'] });
    toast({ title: `Removed ${member.full_name || member.email}` });
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole === 'admin' ? 'admin' : 'user');
      toast({ title: `Invited ${inviteEmail}`, description: 'They will receive an email to join.' });
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

  const grouped = {
    admin: staff.filter(s => s.role === 'admin'),
    legislative_director: staff.filter(s => s.role === 'legislative_director'),
    staffer: staff.filter(s => s.role === 'staffer'),
    intern: staff.filter(s => s.role === 'intern'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Directory</h1>
          <p className="text-muted-foreground text-sm">{staff.length} member{staff.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

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
          {ROLES.map(({ value, label, icon: Icon }) => {
            const members = grouped[value] || [];
            if (members.length === 0) return null;
            return (
              <div key={value}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Icon className="w-4 h-4" /> {label}s ({members.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {members.map(member => {
                    const info = roleInfo(member.role);
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
                                {isAdmin && !isCurrentUser ? (
                                  <select
                                    value={member.role}
                                    onChange={e => handleRoleChange(member, e.target.value)}
                                    className="text-[11px] border rounded px-1.5 py-1 bg-background"
                                  >
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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