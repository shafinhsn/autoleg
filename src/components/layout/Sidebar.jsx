import { Link, useLocation } from 'react-router-dom';
import { useOffice } from '@/hooks/useOffice';
import {
  LayoutDashboard, FileText, Upload, Users, LogOut, Building2, Sliders
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/bills', label: 'Bill Tracker', icon: FileText },
  { path: '/staff', label: 'Staff Directory', icon: Users },
  { path: '/import', label: 'Import CSV', icon: Upload },
  { path: '/customize', label: 'Customize', icon: Sliders },
];

export default function Sidebar() {
  const location = useLocation();
  const { office, user } = useOffice();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col z-40">
      {/* Office Branding */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-sidebar-foreground/50 font-medium uppercase tracking-wide">NYS Assembly</p>
            <p className="text-sm font-semibold truncate">{office?.name || 'Bill Tracker 2026'}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground flex-shrink-0">
            {user?.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate capitalize">{user?.role || 'Staff'}</p>
          </div>
        </div>
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}