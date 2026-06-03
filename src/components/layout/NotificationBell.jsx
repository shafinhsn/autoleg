import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';

export default function NotificationBell({ userEmail, officeId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  async function fetchNotifications() {
    if (!userEmail || !officeId) return;
    const results = await base44.entities.Notification.filter(
      { user_email: userEmail, office_id: officeId },
      '-created_date',
      20
    );
    setNotifications(results);
  }

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [userEmail, officeId]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unread = notifications.filter(n => !n.is_read);

  async function markAllRead() {
    const unreadOnes = notifications.filter(n => !n.is_read);
    for (const n of unreadOnes) {
      await base44.entities.Notification.update(n.id, { is_read: true });
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function markRead(id) {
    await base44.entities.Notification.update(id, { is_read: true });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-sidebar-accent transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-sidebar-foreground" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-14 right-4 w-80 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">Notifications</span>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${!n.is_read ? 'bg-blue-50/60' : ''}`}
                >
                  {n.link ? (
                    <Link to={n.link} onClick={() => setOpen(false)} className="block">
                      <NotificationItem n={n} />
                    </Link>
                  ) : (
                    <NotificationItem n={n} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ n }) {
  return (
    <>
      <p className={`text-xs leading-snug ${!n.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
        {n.message}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        {new Date(n.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
    </>
  );
}