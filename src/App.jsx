import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { OfficeProvider, useOffice } from '@/hooks/useOffice';
import AppLayout from '@/components/layout/AppLayout';
import OfficeSetup from '@/pages/OfficeSetup';
import Dashboard from '@/pages/Dashboard';
import Bills from '@/pages/Bills';
import BillDetail from '@/pages/BillDetail';
import ImportCsv from '@/pages/ImportCsv';
import StaffDirectory from '@/pages/StaffDirectory';
import Tasks from '@/pages/Tasks';
import TeamChat from '@/pages/TeamChat';
import Settings from '@/pages/Settings';

const OfficeApp = () => {
  const { needsSetup, loading } = useOffice();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (needsSetup) {
    return <OfficeSetup />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/bills/:id" element={<BillDetail />} />
        <Route path="/import" element={<ImportCsv />} />
        <Route path="/staff" element={<StaffDirectory />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/chat" element={<TeamChat />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <OfficeProvider>
      <OfficeApp />
    </OfficeProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App