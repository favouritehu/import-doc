import { useState } from 'react';
import { Languages, Send } from 'lucide-react';
import type { Note } from '../types';
import { aiTranslate } from '../lib/ai';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const hasZh = (s: string) => /[一-鿿]/.test(s);

// Stable per-note identity. Index keys break here because addNote PREPENDS: after
// posting a note, every cached translation would shift onto the wrong note.
const noteKey = (n: Note) => `${n.t}|${n.a}|${n.m}`;

export function NotesTimeline({ notes, onAdd }: { notes: Note[]; onAdd: (m: string) => void }) {
  const [msg, setMsg] = useState('');
  const [tr, setTr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const submit = () => {
    const m = msg.trim();
    if (!m) return;
    onAdd(m);
    setMsg('');
  };

  const toggle = async (k: string, text: string) => {
    if (tr[k]) {
      setTr((t) => {
        const next = { ...t };
        delete next[k];
        return next;
      });
      return;
    }
    setBusy(k);
    try {
      const out = await aiTranslate(text, hasZh(text) ? 'en' : 'zh');
      setTr((t) => ({ ...t, [k]: out }));
    } catch (e) {
      setTr((t) => ({ ...t, [k]: `⚠ ${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
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
        {notes.map((n) => {
          const k = noteKey(n);
          return (
            <div key={k} className="anim-pop flex gap-3">
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
                <button
                  onClick={() => toggle(k, n.m)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-navy hover:underline"
                >
                  <Languages size={12} />
                  {tr[k] ? 'Show original' : busy === k ? 'Translating…' : 'Translate'}
                </button>
                {tr[k] && <p className="mt-1 rounded-card bg-page px-2 py-1.5 text-sm text-ink">{tr[k]}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
