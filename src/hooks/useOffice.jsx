import { useState, useEffect, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

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

  const { data: office, isLoading: officeLoading, refetch: refetchOffice } = useQuery({
    queryKey: ['my-office', user?.office_id],
    queryFn: async () => {
      if (!user?.office_id) return null;
      const offices = await base44.entities.Office.filter({ id: user.office_id });
      const found = offices[0] || null;
      // Auto-fix: if this user is the office owner but doesn't have admin role, grant it now
      if (found && found.owner_email === user.email && user.role !== 'admin' && user.role !== 'legislative_director') {
        await base44.auth.updateMe({ role: 'admin' });
        window.location.reload();
      }
      return found;
    },
    enabled: !!user?.office_id,
  });

  // Role hierarchy:
  // admin / legislative_director → full admin (can edit, delete, manage settings)
  // staffer / editor → can edit bills but not manage settings/sections
  // viewer / user → read-only access
  const role = user?.role;
  const isOwner = !!(office && user && office.owner_email === user.email);
  const isAdmin = role === 'admin' || role === 'legislative_director' || isOwner;
  const isEditor = isAdmin || role === 'staffer' || role === 'editor';
  const isViewer = !isEditor; // viewer or plain 'user' role = read-only

  const value = {
    user,
    office,
    loading: loading || (!!user?.office_id && officeLoading),
    refetchOffice,
    isAdmin,
    isEditor,
    isViewer,
    isStaff: role === 'staffer' || role === 'user',
    needsSetup: !loading && !!user && !user.office_id,
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