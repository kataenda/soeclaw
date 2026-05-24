import { useEffect, useState } from 'react';

interface RWAAsset {
  symbol: string;
  name: string;
  category: string;
  price_usd: number;
  change_24h: number;
  apy: number;
  daily_yield_per_1k: number;
  risk: string;
  collateral: string;
  protocol: string;
  contract: string;
  compliance: string;
  allocation_pct: number;
}

interface RWAData {
  assets: RWAAsset[];
  market_regime: string;
  blended_apy: number;
  combined_apy: number;
  ai_summary: string;
  strategy: string;
  ai_powered: boolean;
  total_assets: number;
  last_updated: number;
  network: string;
}

const ASSET_ICONS: Record<string, string> = {
  USDY: '🏛️', mETH: '⟠', wUSDM: '💵', REALT: '🏠', PAXG: '🥇', TBILL: '📜',
};

const RISK_COLOR: Record<string, string> = {
  LOW: '#00e87a', MEDIUM: '#f59e0b', HIGH: '#ff3366',
};

const REGIME_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  RISK_OFF: { label: 'RISK OFF',  color: '#ff3366', bg: 'rgba(255,51,102,0.08)'  },
  NEUTRAL:  { label: 'NEUTRAL',   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  RISK_ON:  { label: 'RISK ON',   color: '#00e87a', bg: 'rgba(0,232,122,0.08)'   },
};

export default function RWAPanel() {
  const [data, setData]       = useState<RWAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const load = () => {
    setLoading(true); setError('');
    fetch(`${API}/api/rwa/yields`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Backend unreachable'); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const regime = data ? (REGIME_CONFIG[data.market_regime] ?? REGIME_CONFIG.NEUTRAL) : null;
  const totalVirtualUsd = 100_000;
  const projectedYield  = data ? Math.round(totalVirtualUsd * data.blended_apy / 100) : 0;

  return (
    <div className="panel" style={{ marginBottom: '1rem', padding: '1rem' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.65rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:'0.78rem', fontFamily:'JetBrains Mono,monospace', color:'var(--cyan)', textShadow:'0 0 8px var(--cyan-glow)' }}>// RWA_AI_PORTFOLIO</span>
          {data?.ai_powered && (
            <span style={{ fontSize:'0.55rem', background:'rgba(167,139,250,0.15)', border:'1px solid rgba(167,139,250,0.3)', color:'#a78bfa', borderRadius:4, padding:'1px 5px', fontFamily:'JetBrains Mono,monospace' }}>
              ✦ AI
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {regime && (
            <span style={{ fontSize:'0.55rem', background: regime.bg, border:`1px solid ${regime.color}44`, color: regime.color, borderRadius:4, padding:'2px 6px', fontFamily:'JetBrains Mono,monospace', fontWeight:700 }}>
              {regime.label}
            </span>
          )}
          <button className="neon-btn" onClick={load} style={{ fontSize:'0.65rem', padding:'2px 7px' }}>↻</button>
        </div>
      </div>

      {loading && <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace' }}>Fetching yield data...</p>}
      {error   && <p style={{ fontSize:'0.72rem', color:'var(--pink)' }}>{error}</p>}

      {data && (
        <>
          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:'0.65rem' }}>
            {[
              { label:'BLENDED APY',   value:`${data.blended_apy.toFixed(2)}%`,    color:'#00d4ff' },
              { label:'ANNUAL YIELD',  value:`$${projectedYield.toLocaleString()}`, color:'#00e87a' },
              { label:'ASSETS',        value:`${data.total_assets} RWA`,            color:'#f59e0b' },
            ].map(k => (
              <div key={k.label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:6, padding:'0.45rem 0.6rem' }}>
                <div style={{ fontSize:'0.55rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace', textTransform:'uppercase', letterSpacing:'0.5px' }}>{k.label}</div>
                <div style={{ fontSize:'0.92rem', fontWeight:700, color:k.color, fontFamily:'JetBrains Mono,monospace', marginTop:2 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Strategy + AI summary */}
          <div style={{ background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.12)', borderRadius:6, padding:'0.5rem 0.65rem', marginBottom:'0.65rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#a78bfa', fontFamily:'JetBrains Mono,monospace', textTransform:'uppercase' }}>
                {data.ai_powered ? '✦ AI Strategy' : '⚙ Rule-Based'}
              </span>
              <span style={{ fontSize:'0.65rem', color:'#f59e0b', fontFamily:'JetBrains Mono,monospace' }}>{data.strategy}</span>
            </div>
            <p style={{ fontSize:'0.67rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace', lineHeight:1.5, margin:0 }}>{data.ai_summary}</p>
          </div>

          {/* Asset cards */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {data.assets.map(asset => {
              const isOpen = expanded === asset.symbol;
              const riskColor = RISK_COLOR[asset.risk] ?? '#888';
              return (
                <div
                  key={asset.symbol}
                  onClick={() => setExpanded(isOpen ? null : asset.symbol)}
                  style={{ background:'rgba(255,255,255,0.025)', border:`1px solid ${isOpen ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius:6, padding:'0.5rem 0.65rem', cursor:'pointer', transition:'border-color 0.15s' }}
                >
                  {/* Row: icon + name + apy + allocation */}
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:'1rem', flexShrink:0 }}>{ASSET_ICONS[asset.symbol] ?? '📦'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#00d4ff', fontFamily:'JetBrains Mono,monospace' }}>{asset.symbol}</span>
                          <span style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace' }}>{asset.category}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#00e87a', fontFamily:'JetBrains Mono,monospace' }}>{asset.apy}% APY</span>
                          <span style={{ fontSize:'0.65rem', color: riskColor, fontFamily:'JetBrains Mono,monospace', background:`${riskColor}18`, border:`1px solid ${riskColor}33`, borderRadius:3, padding:'1px 5px' }}>{asset.risk}</span>
                        </div>
                      </div>
                      {/* Allocation bar */}
                      <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${asset.allocation_pct}%`, background:'linear-gradient(90deg,#00d4ff,#00e87a)', borderRadius:2, transition:'width 0.5s ease' }} />
                        </div>
                        <span style={{ fontSize:'0.6rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace', whiteSpace:'nowrap' }}>{asset.allocation_pct}% · ${(totalVirtualUsd * asset.allocation_pct / 100).toLocaleString()}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:'0.55rem', color:'var(--text-dim)', marginLeft:2 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.05)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px' }}>
                      {[
                        { label:'Protocol',    value: asset.protocol },
                        { label:'Price',       value: `$${asset.price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` },
                        { label:'Collateral',  value: asset.collateral },
                        { label:'Daily/1k',    value: `$${asset.daily_yield_per_1k.toFixed(4)}` },
                        { label:'Compliance',  value: asset.compliance },
                        { label:'Contract',    value: `${asset.contract.slice(0,6)}…${asset.contract.slice(-4)}` },
                      ].map(row => (
                        <div key={row.label}>
                          <span style={{ fontSize:'0.55rem', color:'var(--text-dim)', fontFamily:'JetBrains Mono,monospace', textTransform:'uppercase', display:'block' }}>{row.label}</span>
                          <span style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace', wordBreak:'break-all' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop:'0.6rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'0.55rem', color:'var(--text-dim)', fontFamily:'JetBrains Mono,monospace' }}>
              {data.network} · updated {new Date(data.last_updated * 1000).toLocaleTimeString()}
            </span>
            <span style={{ fontSize:'0.55rem', color:'var(--cyan)', fontFamily:'JetBrains Mono,monospace', opacity:0.6 }}>
              AI × RWA on Mantle
            </span>
          </div>
        </>
      )}
    </div>
  );
}
