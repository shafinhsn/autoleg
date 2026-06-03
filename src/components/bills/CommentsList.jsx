import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Check, X } from 'lucide-react';

export default function CommentsList({ comments, billId, officeId, currentUser }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  async function handleDelete(commentId) {
    if (!confirm('Delete this comment?')) return;
    await base44.entities.Comment.delete(commentId);
    qc.invalidateQueries({ queryKey: ['comments', billId] });
  }

  function startEdit(comment) {
    setEditingId(comment.id);
    setEditText(comment.text);
  }

  async function handleSaveEdit(commentId) {
    if (!editText.trim()) return;
    await base44.entities.Comment.update(commentId, { text: editText.trim() });
    qc.invalidateQueries({ queryKey: ['comments', billId] });
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map(c => {
        const isOwner = currentUser && (c.author_name === currentUser.full_name || c.author_name === currentUser.email);
        const isEditing = editingId === c.id;

        return (
          <div key={c.id} className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{c.author_name || 'Staff'}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {isOwner && !isEditing && (
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(c)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
              {isEditing && (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleSaveEdit(c.id)} className="p-1 hover:bg-green-100 rounded text-green-600 transition-colors">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={cancelEdit} className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {isEditing ? (
              <Textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="text-sm mt-1"
                rows={2}
                autoFocus
              />
            ) : (
              <p className="text-sm">{c.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}