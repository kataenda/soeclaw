import { useState, useEffect } from 'react';

/* ── Types ── */
interface Alert { type: string; symbol: string; title?: string; message: string; severity: string; timestamp: string }
interface GasOp  { gas_units: number; cost_mnt: number; cost_usd: number }
interface GasData { gas_price_gwei: number; network: string; mnt_usd: number; operations: Record<string, GasOp> }
interface RWAAsset { name: string; symbol: string; apy: number; apy_pct?: number; allocation_pct: number; risk_level: string; risk?: string; daily_yield_per_1k: number; strategy_rec?: string }
interface RWAData  { combined_apy: number; blended_apy?: number; ai_summary: string; rationale?: string; strategy?: string; assets: RWAAsset[]; market_regime: string }
interface AuditIssue { severity: string; title: string; description: string; recommendation: string }
interface AuditResult { risk_score: number; overall_verdict: string; summary: string; issues: AuditIssue[]; mantle_specific: string[] }
interface Agent { name: string; virtual_balance_mnt: number; starting_balance_mnt: number; total_pnl_mnt: number; total_pnl_pct: number; skills: string[]; trade_count: number }
interface Achievement { id: string; name: string; description: string; icon: string; unlocked: boolean; unlocked_by?: string }

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const SEV_COLOR: Record<string, string> = {
  critical:'#ff3366', high:'#ff6600', medium:'#f59e0b', low:'#00d4ff', info:'#6b7fa3',
  CRITICAL:'#ff3366', HIGH:'#ff6600', MEDIUM:'#f59e0b', LOW:'#00d4ff', INFO:'#6b7fa3',
};
const RISK_COLOR = (r: string) => ({ 'Very Low':'#00e87a', Low:'#00e87a', Medium:'#f59e0b', High:'#ff3366' })[r] ?? '#888';
const TYPE_ICON: Record<string, string> = { spike:'🚀', crash:'📉', rsi_overbought:'🔴', rsi_oversold:'🟢', volatility_spike:'⚡', whale_transfer:'🐋', extreme_move:'⚠️' };
const fmtTime = (ts: string) => { try { return new Date(ts).toLocaleTimeString(); } catch { return ts; } };

/* ─────────────────────────────── Alpha Tab ─────────────────────────────── */
function AlphaTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/alpha/alerts`)
      .then(r => r.json())
      .then(d => { setAlerts(Array.isArray(d) ? d : (d.alerts ?? [])); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00e87a', animation: 'pulse 2s infinite', boxShadow: '0 0 6px #00e87a' }} />
          <span className="mono-text text-muted" style={{ fontSize: '0.68rem' }}>LIVE · AUTO-REFRESH 30s</span>
        </div>
        <button className="neon-btn" onClick={load} style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem' }}>↻</button>
      </div>

      {loading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Scanning for alpha signals...</p>}

      {!loading && alerts.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>📡</span>
          <div>
            <div className="mono-text text-green" style={{ fontSize: '0.78rem', fontWeight: 600 }}>All Clear</div>
            <div className="mono-text text-muted" style={{ fontSize: '0.7rem' }}>No anomalies detected — markets stable</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
        {alerts.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.5rem 0.65rem', borderRadius: '6px', background: `${SEV_COLOR[a.severity ?? '']}0a`, borderLeft: `3px solid ${SEV_COLOR[a.severity ?? ''] ?? '#333'}` }}>
            <span style={{ fontSize: '1rem', lineHeight: 1, marginTop: '1px' }}>{TYPE_ICON[a.type ?? ''] ?? '🔔'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                  <span className="mono-text" style={{ color: '#00d4ff', fontSize: '0.72rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title ?? a.symbol ?? '—'}
                  </span>
                  {a.severity && (
                    <span className={`badge badge-${a.severity.toLowerCase()}`} style={{ flexShrink: 0 }}>{a.severity.toUpperCase()}</span>
                  )}
                </div>
                <span className="mono-text text-muted" style={{ fontSize: '0.62rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtTime(a.timestamp)}</span>
              </div>
              <p className="mono-text" style={{ fontSize: '0.7rem', color: '#c0cce0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message ?? ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── RWA Tab ─────────────────────────────── */
function RWATab() {
  const [data, setData] = useState<RWAData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/rwa/yields`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Fetching yield data...</p>;
  if (!data)   return <p className="mono-text" style={{ color: '#ff3366', fontSize: '0.75rem' }}>Failed to load RWA data.</p>;

  const apy = data.combined_apy ?? data.blended_apy ?? 0;
  const regime = data.market_regime ?? 'NEUTRAL';
  const summary = data.ai_summary ?? data.rationale ?? '';

  return (
    <div className="fade-in">
      {/* Metric strip */}
      <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div className="stat-chip">
          <span className="stat-chip-label">Blended APY</span>
          <span className="stat-chip-value text-green">{apy.toFixed(2)}%</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-label">Market Regime</span>
          <span className="stat-chip-value" style={{ color: '#00d4ff' }}>{regime}</span>
        </div>
        <div className="stat-chip" style={{ flex: 1, minWidth: 120 }}>
          <span className="stat-chip-label">Strategy</span>
          <span className="stat-chip-value" style={{ color: '#f59e0b', fontSize: '0.78rem' }}>{data.strategy ?? 'Balanced'}</span>
        </div>
      </div>
      <p className="mono-text text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.65rem', fontStyle: 'italic' }}>{summary}</p>

      {/* Asset cards */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {(data.assets ?? []).map(a => {
          const assetApy = a.apy ?? a.apy_pct ?? 0;
          const risk = a.risk_level ?? a.risk ?? 'Medium';
          return (
            <div key={a.symbol} className="card" style={{ flex: '1 1 160px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div>
                  <span className="mono-text" style={{ color: '#00d4ff', fontWeight: 700, fontSize: '0.82rem' }}>{a.symbol}</span>
                  <span className="mono-text text-muted" style={{ fontSize: '0.65rem', marginLeft: '0.4rem' }}>{a.name}</span>
                </div>
                <span className="mono-text text-green" style={{ fontWeight: 700, fontSize: '0.82rem' }}>{assetApy}%</span>
              </div>
              <div className="progress-bar" style={{ marginBottom: '0.3rem' }}>
                <div className="progress-bar-fill" style={{ width: `${a.allocation_pct ?? 50}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>{a.allocation_pct ?? 50}% allocation</span>
                <span className="mono-text" style={{ fontSize: '0.65rem', color: RISK_COLOR(risk) }}>{risk} risk</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────── DevTools Tab ─────────────────────────── */
function DevToolsTab() {
  const [gasData, setGasData] = useState<GasData | null>(null);
  const [subTab, setSubTab] = useState<'gas' | 'audit'>('gas');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditErr, setAuditErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/devtools/gas`)
      .then(r => r.json()).then(setGasData).catch(() => {});
  }, []);

  const runAudit = async () => {
    if (!code.trim()) return;
    setAuditing(true); setAuditErr(''); setResult(null);
    try {
      const res = await fetch(`${API}/api/devtools/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (d.error) setAuditErr(d.error); else setResult(d);
    } catch { setAuditErr('Backend unreachable'); }
    setAuditing(false);
  };

  const riskColor = (s: number) => s >= 40 ? '#ff3366' : s >= 15 ? '#f59e0b' : '#00e87a';
  const EXAMPLE = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract Vault {\n    mapping(address => uint256) public balances;\n    function deposit() external payable { balances[msg.sender] += msg.value; }\n    function withdraw(uint256 amt) external {\n        require(balances[msg.sender] >= amt);\n        (bool ok,) = msg.sender.call{value: amt}("");\n        require(ok);\n        balances[msg.sender] -= amt; // reentrancy!\n    }\n}`;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem' }}>
        {(['gas', 'audit'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className="neon-btn"
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.65rem', background: subTab === t ? 'rgba(0,212,255,0.14)' : undefined, borderColor: subTab === t ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: subTab === t ? '#00d4ff' : '#6b7fa3' }}>
            {t === 'gas' ? '⛽ Gas Prices' : '🔍 Audit Contract'}
          </button>
        ))}
        {gasData && (
          <div className="stat-chip" style={{ marginLeft: 'auto' }}>
            <span className="stat-chip-label">Gas Price</span>
            <span className="stat-chip-value" style={{ fontSize: '0.82rem', color: '#00d4ff' }}>{gasData.gas_price_gwei} Gwei</span>
          </div>
        )}
      </div>

      {subTab === 'gas' && gasData && (
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Operation</th><th style={{ textAlign:'right' }}>Gas</th><th style={{ textAlign:'right' }}>MNT</th><th style={{ textAlign:'right' }}>USD</th></tr></thead>
            <tbody>
              {Object.entries(gasData.operations).map(([op, info]) => (
                <tr key={op}>
                  <td className="mono-text" style={{ color: '#c0cce0' }}>{op}</td>
                  <td className="mono-text text-muted" style={{ textAlign:'right' }}>{info.gas_units.toLocaleString()}</td>
                  <td className="mono-text" style={{ textAlign:'right', color:'#00d4ff' }}>{info.cost_mnt.toFixed(6)}</td>
                  <td className="mono-text text-green" style={{ textAlign:'right' }}>${info.cost_usd.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'audit' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
            <span className="mono-text text-muted" style={{ fontSize: '0.68rem' }}>Paste Solidity:</span>
            <button className="neon-btn" style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }} onClick={() => setCode(EXAMPLE)}>Load Example</button>
          </div>
          <textarea value={code} onChange={e => setCode(e.target.value)}
            placeholder="// pragma solidity ^0.8.20;"
            style={{ width:'100%', height:'80px', background:'rgba(0,0,0,0.4)', border:'1px solid rgba(0,212,255,0.2)', borderRadius:'5px', color:'#c0cce0', fontFamily:'JetBrains Mono,monospace', fontSize:'0.72rem', padding:'0.45rem', resize:'vertical', boxSizing:'border-box', marginBottom:'0.5rem' }}
          />
          <button className="neon-btn" onClick={runAudit} disabled={auditing || !code.trim()} style={{ width:'100%', marginBottom:'0.5rem' }}>
            {auditing ? 'ANALYZING...' : '🔍 RUN AI AUDIT'}
          </button>
          {auditErr && <p style={{ color:'#ff3366', fontSize:'0.72rem' }}>{auditErr}</p>}
          {result && (
            <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                <div className="stat-chip">
                  <span className="stat-chip-label">Risk Score</span>
                  <span className="stat-chip-value" style={{ color: riskColor(result.risk_score) }}>{result.risk_score}/100</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-chip-label">Verdict</span>
                  <span className="stat-chip-value" style={{ fontSize:'0.82rem', color: result.overall_verdict === 'SAFE' ? '#00e87a' : result.overall_verdict === 'UNSAFE' ? '#ff3366' : '#f59e0b' }}>{result.overall_verdict}</span>
                </div>
                <p className="mono-text text-muted" style={{ fontSize:'0.7rem', alignSelf:'center' }}>{result.summary}</p>
              </div>
              <div style={{ maxHeight:'100px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                {result.issues.map((iss, i) => (
                  <div key={i} style={{ borderLeft:`3px solid ${SEV_COLOR[iss.severity]}`, padding:'0.35rem 0.5rem', background:`${SEV_COLOR[iss.severity]}08`, borderRadius:'4px' }}>
                    <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', marginBottom:'0.1rem' }}>
                      <span className={`badge badge-${iss.severity.toLowerCase()}`}>{iss.severity}</span>
                      <span className="mono-text" style={{ fontSize:'0.73rem', color:'#dde6f0', fontWeight:600 }}>{iss.title}</span>
                    </div>
                    <p className="mono-text text-muted" style={{ fontSize:'0.68rem', margin:0 }}>{iss.description}</p>
                    <p className="mono-text" style={{ fontSize:'0.68rem', color:'#00e87a', margin:'0.1rem 0 0' }}>→ {iss.recommendation}</p>
                  </div>
                ))}
              </div>
              {result.mantle_specific.length > 0 && (
                <div>
                  {result.mantle_specific.map((n, i) => <p key={i} className="mono-text" style={{ fontSize:'0.68rem', color:'#00d4ff' }}>• {n}</p>)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Economy Tab ─────────────────────────── */
function EconomyTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [subTab, setSubTab] = useState<'agents' | 'badges'>('agents');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/agents/economy`).then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/achievements`).then(r => r.json()).then(d => setAchievements(Array.isArray(d) ? d : (d.achievements ?? []))).catch(() => {});
  }, []);

  const totalMnt = agents.reduce((s, a) => s + (a.virtual_balance_mnt ?? 0), 0);

  const share = async () => {
    const n = achievements.filter(a => a.unlocked).length;
    const text = `🤖 SoeClaw AI — ${n}/${achievements.length} badges unlocked! Autonomous AI trading on Mantle L2. #SoeClaw #MantleNetwork #DeFAI`;
    if (navigator.share) { try { await navigator.share({ title: 'SoeClaw AI', text, url: location.href }); return; } catch {} }
    await navigator.clipboard.writeText(`${text}\n${location.href}`);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const unlocked = achievements.filter(a => a.unlocked).length;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem', alignItems: 'center' }}>
        {(['agents', 'badges'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className="neon-btn"
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.65rem', background: subTab === t ? 'rgba(0,212,255,0.14)' : undefined, borderColor: subTab === t ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: subTab === t ? '#00d4ff' : '#6b7fa3' }}>
            {t === 'agents' ? '🤖 Agents' : '🏆 Badges'}
          </button>
        ))}
        {agents.length > 0 && (
          <div className="stat-chip" style={{ marginLeft: 'auto' }}>
            <span className="stat-chip-label">Total MNT</span>
            <span className="stat-chip-value" style={{ fontSize: '0.82rem', color: '#00d4ff' }}>{(totalMnt / 1000).toFixed(0)}K</span>
          </div>
        )}
      </div>

      {subTab === 'agents' && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxHeight: '150px', overflowY: 'auto' }}>
          {agents.length === 0 && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Loading agents...</p>}
          {agents.map(ag => (
            <div key={ag.name} className="card" style={{ flex: '1 1 180px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span className="mono-text" style={{ color: '#00d4ff', fontWeight: 700, fontSize: '0.78rem' }}>{ag.name}</span>
                <span className="mono-text" style={{ fontSize: '0.75rem', fontWeight: 700, color: ag.total_pnl_mnt >= 0 ? '#00e87a' : '#ff3366' }}>
                  {ag.total_pnl_pct >= 0 ? '+' : ''}{(ag.total_pnl_pct ?? 0).toFixed(1)}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>{ag.trade_count} trades</span>
                <span className="mono-text text-green" style={{ fontSize: '0.65rem' }}>{(ag.virtual_balance_mnt ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} MNT</span>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {(ag.skills ?? []).map(s => <span key={s} className="badge badge-low">{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'badges' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1, marginRight: '0.75rem' }}>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: achievements.length ? `${(unlocked / achievements.length) * 100}%` : '0%' }} />
              </div>
              <span className="mono-text text-muted" style={{ fontSize: '0.65rem', marginTop: '0.2rem', display: 'block' }}>{unlocked}/{achievements.length} unlocked</span>
            </div>
            <button className="neon-btn" onClick={share}
              style={{ fontSize: '0.7rem', background: copied ? 'rgba(0,232,122,0.12)' : undefined, borderColor: copied ? '#00e87a' : undefined, color: copied ? '#00e87a' : undefined }}>
              {copied ? '✓ Copied' : '📤 Share'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.4rem', maxHeight: '130px', overflowY: 'auto' }}>
            {achievements.map(ach => (
              <div key={ach.id} className="card" style={{ opacity: ach.unlocked ? 1 : 0.4, borderColor: ach.unlocked ? 'rgba(0,232,122,0.25)' : undefined, background: ach.unlocked ? 'rgba(0,232,122,0.06)' : undefined }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{ach.icon}</div>
                <div className="mono-text" style={{ fontSize: '0.7rem', fontWeight: 700, color: ach.unlocked ? '#00e87a' : '#6b7fa3', marginBottom: '0.1rem' }}>{ach.name}</div>
                <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>{ach.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── BottomPanel ─────────────────────────── */
const TABS = [
  { id: 'alpha',    icon: '📡', label: 'Alpha Feed'  },
  { id: 'rwa',      icon: '💵', label: 'RWA Yields'  },
  { id: 'devtools', icon: '⚙️', label: 'DevTools'    },
  { id: 'economy',  icon: '🏆', label: 'Economy'     },
] as const;

type TabId = typeof TABS[number]['id'];

export default function BottomPanel() {
  const [tab, setTab] = useState<TabId>('alpha');

  return (
    <div className="panel bottom-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.78rem', marginRight: '0.25rem' }}>// SOECLAW INSIGHTS</h3>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="neon-btn"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.65rem', background: tab === t.id ? 'rgba(0,212,255,0.14)' : 'transparent', borderColor: tab === t.id ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: tab === t.id ? '#00d4ff' : '#6b7fa3' }}>
              <span style={{ marginRight: '0.25rem' }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'alpha'    && <AlphaTab />}
        {tab === 'rwa'      && <RWATab />}
        {tab === 'devtools' && <DevToolsTab />}
        {tab === 'economy'  && <EconomyTab />}
      </div>
    </div>
  );
}
