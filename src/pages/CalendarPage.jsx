import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { ChevronLeft, ChevronRight, Calendar, Building2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { syncCalendarDates } from '@/lib/syncBill';
import { toast } from '@/components/ui/use-toast';

const COMMITTEE_COLORS = [
  '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f59e0b', '#6366f1', '#ef4444',
];

function getCommitteeColor(committee, index) {
  return COMMITTEE_COLORS[index % COMMITTEE_COLORS.length];
}

export default function CalendarPage() {
  const { office } = useOffice();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const { data: bills = [] } = useQuery({
    queryKey: ['bills', office?.id],
    queryFn: () => base44.entities.Bill.filter({ office_id: office?.id }),
    enabled: !!office?.id,
  });

  // Parse bills that have committee/calendar data
  // Bills with a committee and a "hearing_date" field (stored in session_comments or next_steps)
  // We'll show bills on the calendar based on any date patterns found in their data
  const billsWithDates = bills.filter(b => b.hearing_date || extractDate(b));

  function extractDate(bill) {
    // Look for date patterns in next_steps or session_comments
    const text = `${bill.next_steps || ''} ${bill.session_comments || ''}`;
    const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (dateMatch) return dateMatch[0];
    return null;
  }

  function getBillDate(bill) {
    if (bill.hearing_date) return new Date(bill.hearing_date);
    const d = extractDate(bill);
    if (d) {
      const parsed = new Date(d);
      if (!isNaN(parsed)) return parsed;
    }
    return null;
  }

  async function handleSyncCalendar() {
    setSyncing(true);
    const apiKey = office?.senate_api_key || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
    const updated = await syncCalendarDates(bills, apiKey);
    qc.invalidateQueries({ queryKey: ['bills'] });
    setSyncing(false);
    toast({ title: `Calendar synced — ${updated} bill${updated !== 1 ? 's' : ''} updated with hearing dates` });
  }

  function getBillsForDay(day) {
    return bills.filter(bill => {
      const d = getBillDate(bill);
      return d && isSameDay(d, day);
    });
  }

  // Build calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Unique committees for legend
  const committees = [...new Set(bills.filter(b => b.committee).map(b => b.committee))];

  const dayBills = selectedDay ? getBillsForDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Legislative Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bills in committee and on the Assembly floor — synced from NY Senate API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(d => subMonths(d, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-base font-semibold w-36 text-center">{format(currentDate, 'MMMM yyyy')}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(d => addMonths(d, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="sm" onClick={handleSyncCalendar} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Calendar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-0.5">
                {days.map(day => {
                  const dayBillList = getBillsForDay(day);
                  const isToday = isSameDay(day, new Date());
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isCurrentMonth = isSameMonth(day, currentDate);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={`min-h-[72px] p-1 rounded-md cursor-pointer border transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' :
                        isToday ? 'border-primary/30 bg-primary/5' :
                        'border-transparent hover:border-border hover:bg-muted/30'
                      } ${!isCurrentMonth ? 'opacity-30' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                      }`}>
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-0.5">
                        {dayBillList.slice(0, 3).map(bill => {
                          const cIdx = committees.indexOf(bill.committee);
                          const color = getCommitteeColor(bill.committee, cIdx);
                          return (
                            <div key={bill.id} className="text-[9px] truncate rounded px-1 py-0.5 font-medium text-white"
                              style={{ backgroundColor: color }}>
                              {bill.bill_number} {bill.committee ? `· ${bill.committee.slice(0, 8)}` : ''}
                            </div>
                          );
                        })}
                        {dayBillList.length > 3 && (
                          <div className="text-[9px] text-muted-foreground px-1">+{dayBillList.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Committee Legend */}
          {committees.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {committees.slice(0, 10).map((c, i) => (
                <div key={c} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getCommitteeColor(c, i) }} />
                  <span className="text-muted-foreground">{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {selectedDay ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {format(selectedDay, 'MMMM d, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No bills scheduled</p>
                ) : (
                  <div className="space-y-3">
                    {dayBills.map(bill => (
                      <Link key={bill.id} to={`/bills/${bill.id}`} className="block hover:bg-muted/30 rounded-lg p-2 -mx-2 transition-colors">
                        <div className="flex items-start gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold font-mono text-primary">{bill.bill_number}</p>
                            {bill.committee && <p className="text-xs text-muted-foreground">{bill.committee}</p>}
                            <p className="text-xs truncate mt-0.5">{bill.short_name || bill.title}</p>
                            {bill.latest_status && (
                              <Badge className="text-[10px] mt-1 bg-blue-100 text-blue-700">{bill.latest_status}</Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Click a day to see scheduled bills</p>
              </CardContent>
            </Card>
          )}

          {/* Upcoming events */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upcoming This Month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bills
                .filter(b => {
                  const d = getBillDate(b);
                  return d && isSameMonth(d, currentDate) && d >= new Date();
                })
                .sort((a, b) => getBillDate(a) - getBillDate(b))
                .slice(0, 8)
                .map(bill => {
                  const d = getBillDate(bill);
                  return (
                    <Link key={bill.id} to={`/bills/${bill.id}`} className="flex items-center gap-2 text-xs hover:bg-muted/30 rounded p-1 -mx-1 transition-colors">
                      <div className="w-10 text-center flex-shrink-0">
                        <span className="text-muted-foreground">{format(d, 'MMM')}</span>
                        <p className="font-bold text-sm leading-none">{format(d, 'd')}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-primary">{bill.bill_number}</p>
                        <p className="text-muted-foreground truncate">{bill.committee || bill.latest_status}</p>
                      </div>
                    </Link>
                  );
                })}
              {bills.filter(b => {
                const d = getBillDate(b);
                return d && isSameMonth(d, currentDate) && d >= new Date();
              }).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No upcoming bills this month.<br />
                  Sync bills to pull hearing dates from the API.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}