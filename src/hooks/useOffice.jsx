import { useState, useEffect, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const OfficeContext = createContext(null);

export function OfficeProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const queryClient = useQueryClient();

  const { data: office, isLoading: officeLoading, refetch: refetchOffice } = useQuery({
    queryKey: ['my-office', user?.active_office_id],
    queryFn: async () => {
      if (!user?.active_office_id) return null;
      const offices = await base44.entities.Office.filter({ id: user.active_office_id });
      const found = offices[0] || null;
      
      // Requirement 6: Ensure office creator never loses access
      if (found && found.creator_id === user.id) {
        const memberships = await base44.entities.Membership.filter({ 
          user_id: user.id, 
          office_id: found.id 
        });
        
        if (memberships.length === 0) {
          console.log('[useOffice] Creator without membership - auto-creating OWNER membership');
          console.log(`[useOffice] User ID: ${user.id}`);
          console.log(`[useOffice] Office ID: ${found.id}`);
          
          await base44.entities.Membership.create({
            user_id: user.id,
            office_id: found.id,
            role: 'OWNER',
          });
          
          queryClient.invalidateQueries({ queryKey: ['my-membership'] });
        }
      }
      
      return found;
    },
    enabled: !!user?.active_office_id,
  });

  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ['my-membership', user?.id, office?.id],
    queryFn: async () => {
      if (!user?.id || !office?.id) return null;
      const memberships = await base44.entities.Membership.filter({
        user_id: user.id,
        office_id: office.id,
      });
      return memberships[0] || null;
    },
    enabled: !!user?.id && !!office?.id,
  });

  // Debugging logs (Requirement 7)
  useEffect(() => {
    if (user && office && membership) {
      console.log('[useOffice] Permission Check:');
      console.log(`  User ID: ${user.id}`);
      console.log(`  Office ID: ${office.id}`);
      console.log(`  Membership Role: ${membership.role}`);
      console.log(`  Is Owner: ${membership.role === 'OWNER'}`);
      console.log(`  Is Admin: ${membership.role === 'OWNER' || membership.role === 'ADMIN'}`);
      console.log(`  Is Staff: ${membership.role === 'STAFF'}`);
      console.log(`  Is Read Only: ${membership.role === 'READ_ONLY'}`);
    }
  }, [user, office, membership]);

  // Role-based permissions
  const membershipRole = membership?.role;
  const isOwner = membershipRole === 'OWNER';
  const isAdmin = membershipRole === 'OWNER' || membershipRole === 'ADMIN';
  const isStaff = membershipRole === 'STAFF';
  const isReadOnly = membershipRole === 'READ_ONLY' || !membershipRole;
  const isEditor = isAdmin || isStaff;

  const value = {
    user,
    office,
    membership,
    loading: loading || (!!user?.active_office_id && (officeLoading || membershipLoading)),
    refetchOffice,
    isOwner,
    isAdmin,
    isStaff,
    isReadOnly,
    isEditor,
    membershipRole,
    needsSetup: !loading && !!user && !user.active_office_id,
  };

  return (
    <OfficeContext.Provider value={value}>
      {children}
    </OfficeContext.Provider>
  );
}

export function useOffice() {
  const ctx = useContext(OfficeContext);
  if (!ctx) throw new Error('useOffice must be used within OfficeProvider');
  return ctx;
}