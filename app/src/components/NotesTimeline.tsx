import { useState } from 'react';
import { Send } from 'lucide-react';
import type { Note } from '../types';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function NotesTimeline({ notes, onAdd }: { notes: Note[]; onAdd: (m: string) => void }) {
  const [msg, setMsg] = useState('');
  const submit = () => {
    const m = msg.trim();
    if (!m) return;
    onAdd(m);
    setMsg('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-card border border-border bg-white p-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Add a note for the team…"
          className="w-full bg-transparent px-2 text-sm outline-none placeholder:text-faint"
        />
        <button
          onClick={submit}
          aria-label="Send note"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-white hover:bg-blue"
        >
          <Send size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {notes.map((n, i) => (
          <div key={i} className="anim-pop flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">
              {initials(n.a)}
            </div>
            <div className="min-w-0 flex-1 rounded-card rounded-tl-sm border border-border bg-white p-3 shadow-card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{n.a}</span>
                <span className="rounded-full bg-page px-1.5 py-0.5 text-[10px] font-semibold text-muted">{n.r}</span>
                <span className="ml-auto text-[11px] text-faint">{n.t}</span>
              </div>
              <p className="mt-1 text-sm text-medium">{n.m}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
