import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';

interface ChatMsg { role: 'user' | 'ai'; text: string; powered?: boolean }

export default function CFOPanel() {
  const [aiPowered, setAiPowered] = useState(false);
  const [msgs,    setMsgs]    = useState<ChatMsg[]>([{ role: 'ai', text: 'Halo! Saya AI CFO SoeClaw.\nTanya saya tentang pasar, strategi, portfolio, atau kondisi market saat ini.' }]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [health,  setHealth]  = useState<{ health_score: number; regime: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: ChatMsg = { role: 'user', text };
    setMsgs(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = msgs
        .filter(m => m.role === 'user' || m.role === 'ai')
        .slice(-8)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
      const res = await fetch(`${API_URL}/api/cfo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (data.ai === true) setAiPowered(true);
      setMsgs(prev => [...prev, { role: 'ai', text: data.reply, powered: data.ai === true }]);
    } catch {
      setMsgs(prev => [...prev, { role: 'ai', text: 'Backend tidak dapat dijangkau.' }]);
    }
    setLoading(false);
  }, [input, loading, msgs]);

  const hScore = health?.health_score ?? null;
  const hColor = hScore == null ? '#6b7fa3' : hScore >= 70 ? '#00e87a' : hScore >= 50 ? '#f59e0b' : '#ff3366';
  const regime = health?.regime ?? 'NEUTRAL';
  const regimeColor = regime === 'RISK_OFF' ? '#ff3366' : regime === 'RISK_ON' ? '#00e87a' : '#f59e0b';

  const QUICK = ['Kondisi BTC?', 'Strategi portfolio?', 'Analisis risiko?', 'Status market?'];

  return (
    <div className="panel mono-text" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px rgba(167,139,250,0.8)', animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa' }}>AI CFO</span>
          {aiPowered && (
            <span style={{ fontSize: '0.5rem', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 3, padding: '1px 4px', color: '#a78bfa', fontWeight: 700 }}>Claude</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {hScore !== null && (
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: hColor, background: `${hColor}15`, border: `1px solid ${hColor}33`, borderRadius: 4, padding: '1px 5px' }}>
              {hScore}/100
            </span>
          )}
          <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 3, background: `${regimeColor}12`, border: `1px solid ${regimeColor}33`, color: regimeColor, fontWeight: 700 }}>
            {regime.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: 0 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <span style={{ fontSize: '0.5rem', color: m.powered ? '#a78bfa' : '#4b5a72', marginBottom: '2px', paddingLeft: '2px' }}>
                {m.powered ? 'Claude AI' : 'rule-based'}
              </span>
            )}
            <div style={{
              maxWidth: '90%',
              padding: '0.35rem 0.55rem',
              borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
              background: m.role === 'user' ? 'rgba(167,139,250,0.15)' : 'rgba(0,212,255,0.07)',
              border: `1px solid ${m.role === 'user' ? 'rgba(167,139,250,0.3)' : 'rgba(0,212,255,0.12)'}`,
              fontSize: '0.62rem',
              color: m.role === 'user' ? '#c4b5fd' : '#c0cce0',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.25rem 0.4rem' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#a78bfa', animation: `pulse 1s ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flexShrink: 0 }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => { setInput(q); }} style={{
            fontSize: '0.55rem', padding: '0.2rem 0.45rem', borderRadius: 4, cursor: 'pointer',
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
            color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace',
          }}>{q}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Tanya AI CFO..."
          style={{
            flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(167,139,250,0.25)',
            borderRadius: 5, color: '#c0cce0', fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.65rem', padding: '0.35rem 0.5rem', outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '0.35rem 0.65rem', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', fontWeight: 700,
            background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.4)',
            color: '#a78bfa', opacity: (!input.trim() || loading) ? 0.4 : 1,
          }}
        >→</button>
      </div>
    </div>
  );
}
