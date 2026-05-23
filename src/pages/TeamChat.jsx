import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOffice } from '@/hooks/useOffice';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TeamChat() {
  const { office, user } = useOffice();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  const { data: messages = [] } = useQuery({
    queryKey: ['chat', office?.id],
    queryFn: () => base44.entities.ChatMessage.filter({ office_id: office?.id }, 'created_date', 100),
    enabled: !!office?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim()) return;
    await base44.entities.ChatMessage.create({
      office_id: office.id,
      text: text.trim(),
      author_name: user?.full_name || user?.email || 'Staff',
      author_email: user?.email,
    });
    setText('');
    qc.invalidateQueries({ queryKey: ['chat'] });
  }

  const isOwnMessage = (msg) => msg.author_email === user?.email || msg.created_by === user?.email;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">Team Chat</h1>

      <div className="flex-1 overflow-y-auto bg-card rounded-xl border p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">No messages yet. Start the conversation!</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${isOwnMessage(msg) ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
              isOwnMessage(msg) ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {!isOwnMessage(msg) && (
                <p className="text-[10px] font-medium mb-0.5 opacity-70">{msg.author_name}</p>
              )}
              <p className="text-sm">{msg.text}</p>
              <p className={`text-[9px] mt-1 ${isOwnMessage(msg) ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                {new Date(msg.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <Input
          placeholder="Type a message..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}