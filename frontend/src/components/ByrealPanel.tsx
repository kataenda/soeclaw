import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ByrealOverview { tvl: number; volume_24h_usd: number; fee_24h_usd: number; pools_count: number }
interface PerpSignal { coin: string; direction: string; price: string; rsi: number; score: number }

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

export default function ByrealPanel() {
  const [overview, setOverview] = useState<ByrealOverview | null>(null);
  const [signals, setSignals]   = useState<PerpSignal[]>([]);
  const [error, setError]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [subTab, setSubTab]     = useState<'dex' | 'perps'>('dex');

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch(`${API}/api/byreal/overview`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/byreal/perps/signals`).then(r => r.json()).catch(() => null),
    ]).then(([ov, sg]) => {
      if (ov?.success && ov.data) setOverview(ov.data);
      else if (!ov?.success) setError(true);
      if (sg?.success) {
        setSignals([
          ...(sg.data?.signals?.conservative ?? []),
          ...(sg.data?.signals?.aggressive   ?? []),
        ].slice(0, 12));
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="panel mono-text byreal-side-panel"
      style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.4rem', marginBottom: '0.5rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#f7931a', textShadow: '0 0 10px rgba(247,147,26,0.5)' }}>// BYREAL LIVE</span>
          <span style={{ fontSize: '0.56rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.3)', color: '#f7931a' }}>SDK</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {(['dex', 'perps'] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)} aria-label={t === 'dex' ? 'CLMM DEX' : 'Perps Signals'}
              style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', borderRadius: '3px', cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${subTab === t ? '#f7931a' : 'rgba(255,255,255,0.1)'}`, background: subTab === t ? 'rgba(247,147,26,0.12)' : 'transparent', color: subTab === t ? '#f7931a' : 'var(--text-muted)' }}>
              {t === 'dex' ? 'DEX' : 'Perps'}
            </button>
          ))}
          <button onClick={load} aria-label="Refresh Byreal data"
            style={{ fontSize: '0.62rem', padding: '0.15rem 0.35rem', borderRadius: '3px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)' }}>
            ↻
          </button>
        </div>
      </div>

      {/* ── Content — fills all remaining height ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f7931a', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
            <span className="text-muted" style={{ fontSize: '0.68rem' }}>Connecting to Byreal...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: '0.5rem 0.55rem', background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.2)', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.68rem', color: '#ff3366', marginBottom: '0.2rem' }}>⚠ Byreal SDK offline</div>
            <div className="text-muted" style={{ fontSize: '0.6rem' }}>Node.js required — active in Railway</div>
          </div>
        )}

        {/* DEX Tab */}
        {!loading && !error && subTab === 'dex' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>
            {overview ? (
              <>
                {/* Stat grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  {[
                    { label: 'TVL',      value: fmt(overview.tvl),              color: '#00e87a' },
                    { label: 'Vol 24h',  value: fmt(overview.volume_24h_usd),   color: '#00d4ff' },
                    { label: 'Fees 24h', value: fmt(overview.fee_24h_usd),      color: '#f59e0b' },
                    { label: 'Pools',    value: String(overview.pools_count),   color: '#a78bfa' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '0.45rem 0.55rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="text-muted" style={{ fontSize: '0.58rem', marginBottom: '0.15rem' }}>{s.label}</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Protocol badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.55rem', background: 'rgba(247,147,26,0.05)', border: '1px solid rgba(247,147,26,0.15)', borderRadius: '6px' }}>
                  <span aria-hidden="true">⛓</span>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#f7931a', fontWeight: 600 }}>CLMM DEX · Solana</div>
                    <div className="text-muted" style={{ fontSize: '0.58rem' }}>@byreal-io/byreal-cli</div>
                  </div>
                </div>

                {/* Filler — pushes content up, makes background fill the rest */}
                <div style={{ flex: 1, borderRadius: '6px', background: 'rgba(247,147,26,0.02)', border: '1px solid rgba(247,147,26,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: '0.3rem' }}>⚡</div>
                    <div className="text-muted" style={{ fontSize: '0.6rem', lineHeight: 1.5 }}>
                      Agentic Economy<br />Track 3 · Byreal
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>No DEX data yet.</div>
            )}
          </div>
        )}

        {/* Perps Tab */}
        {!loading && !error && subTab === 'perps' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', overflowY: 'auto', minHeight: 0 }}>
            {signals.length === 0 && (
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>No perp signals.</div>
            )}
            {signals.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.5rem', borderRadius: '5px', background: 'rgba(255,255,255,0.025)', borderLeft: `3px solid ${s.direction === 'Long' ? '#00e87a' : '#ff3366'}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.65rem', color: s.direction === 'Long' ? '#00e87a' : '#ff3366', fontWeight: 700 }}>
                    {s.direction === 'Long' ? '▲' : '▼'}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#00d4ff' }}>{s.coin.replace('xyz:', '')}</div>
                    <div className="text-muted" style={{ fontSize: '0.58rem' }}>${s.price}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: s.score >= 60 ? '#00e87a' : '#f59e0b' }}>score {s.score}</div>
                  <div className="text-muted" style={{ fontSize: '0.58rem' }}>RSI {s.rsi}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
