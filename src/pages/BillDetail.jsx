import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, MessageSquare, Clock, Newspaper, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import MultiTagSelect from '@/components/bills/MultiTagSelect';

export default function BillDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/');
  const billId = pathParts[pathParts.length - 1];
  const { office } = useOffice();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [draftTags, setDraftTags] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);

  const { data: bill, isLoading } = useQuery({
    queryKey: ['bill', billId],
    queryFn: async () => {
      const bills = await base44.entities.Bill.filter({ id: billId });
      return bills[0] || null;
    },
    enabled: !!billId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', billId],
    queryFn: () => base44.entities.Comment.filter({ bill_id: billId }),
    enabled: !!billId,
  });

  function startEdit() {
    if (!bill) return;
    setDraft({
      title: bill.title || '',
      short_name: bill.short_name || '',
      senate_sponsor: bill.senate_sponsor || '',
      assembly_sponsor: bill.assembly_sponsor || '',
      committee: bill.committee || '',
      latest_status: bill.latest_status || '',
      priority_rank: bill.priority_rank || '',
      pc_contact: bill.pc_contact || '',
      next_steps: bill.next_steps || '',
      session_comments: bill.session_comments || '',
      lobbyist: bill.lobbyist || '',
      bill_documents: bill.bill_documents || '',
      internal_notes: bill.internal_notes || '',
      staff_assignees: bill.staff_assignees || '',
      linked_senate_bill: bill.linked_senate_bill || '',
      google_drive_url: bill.google_drive_url || '',
      section_header: bill.section_header || '',
    });
    setDraftTags(bill.tags || []);
    setEditing(true);
  }

  async function handleSave() {
    await base44.entities.Bill.update(bill.id, { ...draft, tags: draftTags });
    qc.invalidateQueries({ queryKey: ['bill', billId] });
    qc.invalidateQueries({ queryKey: ['bills'] });
    setEditing(false);
    toast({ title: 'Bill updated' });
  }

  async function handleSync() {
    setSyncing(true);
    const url = `https://legislation.nysenate.gov/api/3/bills/${bill.session_year || 2026}/${bill.bill_number}?key=tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Not found');
      const data = await resp.json();
      const result = data?.result;
      if (!result) throw new Error('No result');

      const updateData = {};
      const sponsor = result.sponsor?.member;
      if (sponsor) {
        const sponsorName = sponsor.fullName || sponsor.shortName || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim();
        if (sponsorName) updateData.senate_sponsor = sponsorName;
      }
      if (result.title) updateData.title = result.title;
      if (result.status?.statusDesc) updateData.latest_status = result.status.statusDesc;
      if (result.status?.committeeName) updateData.committee = result.status.committeeName;

      const sameAs = result.amendments?.items;
      if (sameAs) {
        const latestAmendment = Object.values(sameAs).pop();
        if (latestAmendment?.sameAs?.items?.[0]) {
          updateData.linked_senate_bill = latestAmendment.sameAs.items[0].basePrintNo;
        }
      }

      await base44.entities.Bill.update(bill.id, updateData);
      qc.invalidateQueries({ queryKey: ['bill', billId] });
      toast({ title: 'Synced from Senate API' });
    } catch {
      toast({ title: 'Sync failed', description: 'Bill may not be found in Senate API', variant: 'destructive' });
    }
    setSyncing(false);
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    const user = await base44.auth.me();
    await base44.entities.Comment.create({
      bill_id: billId,
      office_id: office?.id,
      text: newComment.trim(),
      author_name: user.full_name || user.email,
    });
    qc.invalidateQueries({ queryKey: ['comments', billId] });
    setNewComment('');
    toast({ title: 'Comment added' });
  }

  async function fetchNews() {
    if (!office?.news_api_key) {
      toast({ title: 'No News API key', description: 'Add your News API key in Settings', variant: 'destructive' });
      return;
    }
    setLoadingNews(true);
    try {
      const query = bill.bill_number + (bill.short_name ? ` OR "${bill.short_name}"` : '');
      const resp = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&apiKey=${office.news_api_key}`);
      const data = await resp.json();
      setNews(data.articles || []);
    } catch {
      toast({ title: 'Failed to fetch news', variant: 'destructive' });
    }
    setLoadingNews(false);
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!bill) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Bill not found.</p>
        <Link to="/bills" className="text-primary hover:underline text-sm mt-2 inline-block">Back to bills</Link>
      </div>
    );
  }

  const Field = ({ label, field, textarea }) => {
    const value = editing ? (draft[field] ?? '') : (bill[field] ?? '');
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
        {editing ? (
          textarea ? (
            <Textarea value={value} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} className="text-sm" rows={3} />
          ) : (
            <Input value={value} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} className="text-sm" />
          )
        ) : (
          <p className="text-sm">{value || <span className="text-muted-foreground/40 italic">Not set</span>}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/bills" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{bill.bill_number}</h1>
            <p className="text-muted-foreground text-sm">{bill.short_name || bill.title || 'Untitled'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave}><Save className="w-4 h-4 mr-1.5" /> Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" onClick={startEdit}>Edit Bill</Button>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <MultiTagSelect tags={draftTags} onChange={setDraftTags} />
        ) : (
          (bill.tags || []).map(t => (
            <Badge key={t} className="bg-primary/10 text-primary border-0">{t}</Badge>
          ))
        )}
        {bill.section_header && (
          <Badge variant="outline">{bill.section_header}</Badge>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="comments"><MessageSquare className="w-3.5 h-3.5 mr-1" /> Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="news"><Newspaper className="w-3.5 h-3.5 mr-1" /> News</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Core Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Field label="Title" field="title" textarea />
                <Field label="Short Name" field="short_name" />
                <Field label="Senate Sponsor" field="senate_sponsor" />
                <Field label="Assembly Sponsor" field="assembly_sponsor" />
                <Field label="Committee" field="committee" />
                <Field label="Status" field="latest_status" />
                <Field label="Linked Senate Bill" field="linked_senate_bill" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Tracking & Notes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Field label="P&C Contact" field="pc_contact" />
                <Field label="Staff Assignees" field="staff_assignees" />
                <Field label="Lobbyist / Advocate" field="lobbyist" />
                <Field label="Next Steps" field="next_steps" textarea />
                <Field label="Session Comments" field="session_comments" textarea />
                <Field label="Internal Notes" field="internal_notes" textarea />
                <Field label="Google Drive URL" field="google_drive_url" />
                {editing && <Field label="Section Header" field="section_header" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-3">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="text-sm"
                  rows={2}
                />
                <Button size="sm" onClick={handleAddComment} className="self-end">Post</Button>
              </div>
              <div className="space-y-3">
                {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>}
                {comments.map(c => (
                  <div key={c.id} className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{c.author_name || 'Staff'}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(c.created_date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm">{c.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="news" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <Button variant="outline" size="sm" onClick={fetchNews} disabled={loadingNews} className="mb-4">
                {loadingNews ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Fetching...</> : <><Newspaper className="w-4 h-4 mr-1.5" /> Fetch News</>}
              </Button>
              {!office?.news_api_key && (
                <p className="text-sm text-muted-foreground mb-4">Add your News API key in <Link to="/settings" className="text-primary hover:underline">Settings</Link> to fetch news about this bill.</p>
              )}
              <div className="space-y-3">
                {news.length === 0 && !loadingNews && <p className="text-sm text-muted-foreground text-center py-4">No news articles yet. Click "Fetch News" to search.</p>}
                {news.map((article, i) => (
                  <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" className="block p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <h3 className="text-sm font-medium">{article.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <span>{article.source?.name}</span>
                      <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}