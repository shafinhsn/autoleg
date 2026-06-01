import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import MultiTagSelect from '@/components/bills/MultiTagSelect';
import { syncBill } from '@/lib/syncBill';

export default function BillDetail() {
  const pathParts = window.location.pathname.split('/');
  const billId = pathParts[pathParts.length - 1];
  const { office, isAdmin } = useOffice();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [draftTags, setDraftTags] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [newComment, setNewComment] = useState('');

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
    qc.invalidateQueries({ queryKey: ['bills', office?.id] });
    setEditing(false);
  }

  async function handleSync() {
    setSyncing(true);
    const apiKey = office?.senate_api_key || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
    const updateData = await syncBill(bill, apiKey);
    if (updateData) await base44.entities.Bill.update(bill.id, updateData);
    qc.invalidateQueries({ queryKey: ['bill', billId] });
    qc.invalidateQueries({ queryKey: ['bills', office?.id] });
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
            <Button size="sm" onClick={startEdit} disabled={!isAdmin}>Edit Bill</Button>
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
      </Tabs>
    </div>
  );
}