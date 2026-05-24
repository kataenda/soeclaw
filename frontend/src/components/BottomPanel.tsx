import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/TranslationContext';

/* ── Types ── */
interface Alert { type: string; symbol: string; title?: string; message: string; severity: string; timestamp: string }
interface GasOp  { gas_units: number; cost_mnt: number; cost_usd: number }
interface GasData { gas_price_gwei: number; network: string; mnt_usd: number; operations: Record<string, GasOp> }
interface RWAAsset { name: string; symbol: string; category: string; apy: number; apy_pct?: number; allocation_pct: number; risk_level: string; risk?: string; daily_yield_per_1k: number; strategy_rec?: string; collateral: string; protocol: string; compliance: string }
interface RWAData  { combined_apy: number; blended_apy?: number; ai_summary: string; rationale?: string; strategy?: string; assets: RWAAsset[]; market_regime: string; ai_powered?: boolean; total_assets?: number; rebalance_tx?: string; rebalance_explorer?: string }
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

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[80, 65, 72].map(w => (
            <div key={w} style={{ display: 'flex', gap: '0.6rem', padding: '0.5rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div className="skeleton" style={{ height: 10, width: `${w}%` }} />
                <div className="skeleton" style={{ height: 8, width: '90%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

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
  const [data, setData]         = useState<RWAData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [rebalancing, setReb]   = useState(false);
  const [lastTx, setLastTx]     = useState<{ hash: string; url: string } | null>(null);
  const [subTab, setSubTab]     = useState<'portfolio' | 'detail'>('portfolio');

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/rwa/yields`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const rebalance = async () => {
    setReb(true);
    try {
      const r = await fetch(`${API}/api/rwa/rebalance`, { method: 'POST' });
      const d = await r.json();
      setData(d);
      if (d.rebalance_tx) setLastTx({ hash: d.rebalance_tx, url: d.rebalance_explorer });
    } catch { /* ignore */ }
    setReb(false);
  };

  if (loading) return <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Fetching RWA portfolio...</p>;
  if (!data)   return <p className="mono-text" style={{ color: '#ff3366', fontSize: '0.75rem' }}>Failed to load RWA data.</p>;

  const apy    = data.blended_apy ?? data.combined_apy ?? 0;
  const regime = data.market_regime ?? 'NEUTRAL';
  const regimeColor = regime === 'RISK_OFF' ? '#ff3366' : regime === 'RISK_ON' ? '#00e87a' : '#00d4ff';

  return (
    <div className="fade-in">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="stat-chip">
            <span className="stat-chip-label">Blended APY</span>
            <span className="stat-chip-value text-green">{apy.toFixed(2)}%</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Regime</span>
            <span className="stat-chip-value" style={{ color: regimeColor, fontSize: '0.72rem' }}>{regime}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Assets</span>
            <span className="stat-chip-value" style={{ color: '#a78bfa' }}>{data.total_assets ?? data.assets?.length ?? 0} RWA</span>
          </div>
          {data.ai_powered && (
            <div className="stat-chip" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'rgba(0,212,255,0.2)' }}>
              <span className="stat-chip-label">Allocation</span>
              <span className="stat-chip-value" style={{ color: '#00d4ff', fontSize: '0.7rem' }}>🤖 AI-Driven</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          {(['portfolio', 'detail'] as const).map(t => (
            <button key={t} className="neon-btn" onClick={() => setSubTab(t)}
              style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: subTab === t ? 'rgba(0,212,255,0.12)' : 'transparent', borderColor: subTab === t ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: subTab === t ? '#00d4ff' : '#6b7fa3' }}>
              {t === 'portfolio' ? 'Portfolio' : 'Details'}
            </button>
          ))}
          <button className="neon-btn" onClick={rebalance} disabled={rebalancing}
            style={{ fontSize: '0.65rem', padding: '0.2rem 0.55rem', borderColor: 'rgba(247,147,26,0.4)', color: '#f7931a' }}>
            {rebalancing ? '...' : '⚡ Rebalance'}
          </button>
        </div>
      </div>

      {/* AI summary */}
      <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '6px', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
          <span className="mono-text" style={{ fontSize: '0.58rem', color: '#00d4ff', fontWeight: 700 }}>
            🤖 AI PORTFOLIO MANAGER
          </span>
          <span className="mono-text text-muted" style={{ fontSize: '0.58rem' }}>— {data.strategy}</span>
        </div>
        <p className="mono-text text-muted" style={{ fontSize: '0.65rem', margin: 0, lineHeight: 1.5 }}>{data.ai_summary}</p>
      </div>

      {/* On-chain proof */}
      {lastTx && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.55rem', background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.2)', borderRadius: '5px', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem' }}>⛓</span>
          <span className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>Rebalance recorded: {lastTx.hash.slice(0, 18)}…</span>
          <a href={lastTx.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.6rem', color: '#f7931a', textDecoration: 'underline', fontWeight: 700, marginLeft: 'auto' }}>verify ↗</a>
        </div>
      )}

      {/* Portfolio view */}
      {subTab === 'portfolio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '120px', overflowY: 'auto' }}>
          {(data.assets ?? []).map(a => {
            const risk  = a.risk_level ?? a.risk ?? 'MEDIUM';
            const alloc = a.allocation_pct ?? 0;
            return (
              <div key={a.symbol} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="mono-text" style={{ fontSize: '0.68rem', color: '#00d4ff', fontWeight: 700, minWidth: '52px' }}>{a.symbol}</span>
                <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${alloc}%`, background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                </div>
                <span className="mono-text" style={{ fontSize: '0.65rem', color: '#00e87a', fontWeight: 700, minWidth: '36px', textAlign: 'right' }}>{alloc}%</span>
                <span className="mono-text text-muted" style={{ fontSize: '0.6rem', minWidth: '40px' }}>{a.apy}% APY</span>
                <span className="mono-text" style={{ fontSize: '0.58rem', color: RISK_COLOR(risk), minWidth: '28px' }}>{risk}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail view */}
      {subTab === 'detail' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
          {(data.assets ?? []).map(a => (
            <div key={a.symbol} style={{ padding: '0.35rem 0.5rem', borderRadius: '5px', background: 'rgba(255,255,255,0.025)', borderLeft: `3px solid ${RISK_COLOR(a.risk_level ?? 'MEDIUM')}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                <span className="mono-text" style={{ fontSize: '0.68rem', color: '#00d4ff', fontWeight: 700 }}>{a.symbol} · {a.category}</span>
                <span className="mono-text text-green" style={{ fontSize: '0.68rem', fontWeight: 700 }}>{a.apy}% APY</span>
              </div>
              <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>{a.collateral}</div>
              {a.compliance && (
                <div className="mono-text" style={{ fontSize: '0.58rem', color: '#f59e0b', marginTop: '0.1rem' }}>⚖ {a.compliance}</div>
              )}
            </div>
          ))}
        </div>
      )}
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
            {t === 'gas' ? 'Gas Prices' : 'Audit Contract'}
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

/* ─────────────────────────────── Agent Intel ─────────────────────────── */
const AGENT_INTEL: Record<string, {
  role: string; model: string; signals: string[]; description: string; edge: string;
  color: string; colorDim: string; colorBg: string; colorBorder: string; icon: string;
}> = {
  WhaleWatcher: {
    role: 'On-Chain Surveillance',
    model: 'Mean-Reversion + Flow Analysis',
    signals: ['Whale transfers >$1M', 'Exchange inflow/outflow', 'Wallet clustering', 'OB depth imbalance'],
    description: 'Monitors large on-chain movements and order-book depth to detect accumulation or distribution before price reacts. Triggers contrarian trades when whale behavior diverges from retail sentiment.',
    edge: 'Detects smart-money positioning 2–8 hours before price movement.',
    icon: '🐋',
    color:       '#22d3ee',
    colorDim:    'rgba(34,211,238,0.55)',
    colorBg:     'rgba(34,211,238,0.07)',
    colorBorder: 'rgba(34,211,238,0.35)',
  },
  RiskManager: {
    role: 'Portfolio Risk Control',
    model: 'Volatility-Adjusted Sizing',
    signals: ['ATR-based stop loss', 'Drawdown circuit breaker', 'Correlation matrix', 'Sharpe optimization'],
    description: 'Acts as the portfolio\'s guardian — scales position size inversely to volatility and halts trading when drawdown exceeds thresholds. Every other agent\'s trade is filtered through RiskManager approval.',
    edge: 'Prevents catastrophic loss during black-swan events. Max drawdown capped at 15%.',
    icon: '🛡️',
    color:       '#f97316',
    colorDim:    'rgba(249,115,22,0.55)',
    colorBg:     'rgba(249,115,22,0.07)',
    colorBorder: 'rgba(249,115,22,0.35)',
  },
  AlphaQuant: {
    role: 'Quantitative Momentum',
    model: 'Multi-Timeframe Technical',
    signals: ['RSI divergence', 'MACD crossover', 'Bollinger squeeze', 'Volume breakout'],
    description: 'Pure quant alpha — scans 6 timeframes simultaneously for confluence signals. Enters only when RSI, MACD, and volume patterns agree across at least 3 timeframes, filtering out noise.',
    edge: 'Win rate spikes to 68% when 3+ signals align. Average hold: 4–12 hours.',
    icon: '⚡',
    color:       '#00e87a',
    colorDim:    'rgba(0,232,122,0.55)',
    colorBg:     'rgba(0,232,122,0.07)',
    colorBorder: 'rgba(0,232,122,0.35)',
  },
  MacroAnalyzer: {
    role: 'Macro & Sentiment Intel',
    model: 'SMA-Crossover + Trend',
    signals: ['BTC dominance shifts', 'Fear & Greed index', 'Funding rate extremes', 'Cross-asset correlation'],
    description: 'Positions ahead of broad market regime changes. Tracks crypto-market correlation with TradFi, monitors funding rates for squeeze setups, and uses BTC dominance cycles to time altcoin rotations.',
    edge: 'Best performer in trending markets. Identifies macro regime shifts 1–2 days early.',
    icon: '🔭',
    color:       '#a78bfa',
    colorDim:    'rgba(167,139,250,0.55)',
    colorBg:     'rgba(167,139,250,0.07)',
    colorBorder: 'rgba(167,139,250,0.35)',
  },
};

/* ─────────────────────────────── Economy Tab ─────────────────────────── */
interface LeaderboardAgent {
  id: number; name: string; wallet_address: string;
  roi: number; winrate: number; trust_score: number; total_trades: number;
}
interface OnchainData { name: string; onchain_trades: number; reputation: number }

const REGISTRY_ADDR = '0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d';
const TOKEN_IDS: Record<string, number> = { AlphaQuant: 0, WhaleWatcher: 1, MacroAnalyzer: 3, RiskManager: 4 };
const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];

function EconomyTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [subTab, setSubTab] = useState<'leaderboard' | 'badges'>('leaderboard');
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned,  setPinned]  = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [lbAgents, setLbAgents]   = useState<LeaderboardAgent[]>([]);
  const [onchain, setOnchain]     = useState<Record<string, OnchainData>>({});
  const [lbLoading, setLbLoading] = useState(true);
  const activeIntel = pinned ?? hovered;
  const intelData   = activeIntel ? AGENT_INTEL[activeIntel] : null;

  useEffect(() => {
    fetch(`${API}/api/agents/economy`).then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/achievements`).then(r => r.json()).then(d => setAchievements(Array.isArray(d) ? d : (d.achievements ?? []))).catch(() => {});
    fetch(`${API}/api/agents`)
      .then(r => r.json())
      .then((data: LeaderboardAgent[]) => {
        setLbAgents(data.map(a => ({
          ...a,
          roi: parseFloat((a.roi ?? 0).toFixed(2)),
          winrate: parseFloat((a.winrate ?? 0).toFixed(1)),
          trust_score: Math.floor(a.trust_score ?? 50),
          total_trades: a.total_trades ?? 0,
        })).sort((x, y) => y.roi - x.roi));
        setLbLoading(false);
      }).catch(() => setLbLoading(false));
    fetch(`${API}/api/agents/onchain`)
      .then(r => r.json())
      .then((data: OnchainData[]) => {
        const map: Record<string, OnchainData> = {};
        data.forEach(d => { map[d.name] = d; });
        setOnchain(map);
      }).catch(() => {});
  }, []);

  const agentEconByName = Object.fromEntries(agents.map(a => [a.name, a]));

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
        {([
          ['leaderboard', 'Agent Leaderboard'],
          ['badges',      'Badges'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} className="neon-btn"
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.65rem', background: subTab === id ? 'rgba(0,212,255,0.14)' : undefined, borderColor: subTab === id ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: subTab === id ? '#00d4ff' : '#6b7fa3' }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'leaderboard' && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxHeight: '150px', overflowY: 'auto' }}>
          {lbLoading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Loading leaderboard...</p>}
          {lbAgents.map((agent, i) => {
            const oc          = onchain[agent.name];
            const econ        = agentEconByName[agent.name];
            const tokenId     = TOKEN_IDS[agent.name];
            const explorerUrl = tokenId !== undefined
              ? `https://explorer.sepolia.mantle.xyz/token/${REGISTRY_ADDR}?a=${tokenId}`
              : undefined;
            const intel    = AGENT_INTEL[agent.name];
            const isActive = activeIntel === agent.name;
            const agColor  = intel?.colorBorder ?? 'rgba(0,212,255,0.4)';
            const agBg     = intel?.colorBg     ?? 'rgba(0,212,255,0.05)';
            const rankColor = RANK_COLORS[i] ?? 'var(--text-muted)';
            return (
              <div
                key={agent.id}
                className="card"
                style={{ flex: '1 1 180px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', borderColor: isActive ? agColor : undefined, background: isActive ? agBg : undefined }}
                onMouseEnter={e => { setHovered(agent.name); setPos({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPinned(p => p === agent.name ? null : agent.name)}
              >
                {/* Rank + name + ROI */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="mono-text" style={{ fontSize: '0.68rem', fontWeight: 700, color: rankColor }}>#{i + 1}</span>
                    <span className="mono-text" style={{ color: intel?.color ?? '#00d4ff', fontWeight: 700, fontSize: '0.78rem' }}>{agent.name}</span>
                  </div>
                  <span className="mono-text" style={{ fontSize: '0.75rem', fontWeight: 700, color: agent.roi >= 0 ? '#00e87a' : '#ff3366' }}>
                    {agent.roi >= 0 ? '+' : ''}{agent.roi}%
                  </span>
                </div>
                {/* Trades + Win rate + MNT balance */}
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                  <span className="mono-text text-muted" style={{ fontSize: '0.63rem' }}>{agent.total_trades} trades</span>
                  <span className="mono-text text-muted" style={{ fontSize: '0.63rem' }}>W {agent.winrate}%</span>
                  {econ && (
                    <span className="mono-text text-green" style={{ fontSize: '0.63rem' }}>
                      {(econ.virtual_balance_mnt ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} MNT
                    </span>
                  )}
                </div>
                {/* Skill badges */}
                {econ && (econ.skills ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                    {(econ.skills ?? []).map(s => <span key={s} className="badge badge-low">{s}</span>)}
                  </div>
                )}
                {/* On-chain badges */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {oc && (
                    <span style={{ fontSize: '0.58rem', color: '#f7931a', background: 'rgba(247,147,26,0.1)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(247,147,26,0.3)' }}>
                      ⛓ {oc.onchain_trades}
                    </span>
                  )}
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontSize: '0.58rem', color: '#f7931a', background: 'rgba(247,147,26,0.1)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(247,147,26,0.3)', textDecoration: 'none' }}>
                      ERC-8004 ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent Strategy Intel — portal to document.body to escape backdrop-filter stacking context */}
      {intelData && activeIntel && createPortal(
        <div style={{
          position: 'fixed',
          left: Math.min(pos.x + 16, window.innerWidth - 316),
          top:  pos.y - 250 < 8 ? pos.y + 16 : pos.y - 250,
          width: 300,
          background: 'rgba(6,10,24,0.98)',
          border: `1px solid ${intelData.colorBorder}`,
          borderRadius: 8,
          padding: '0.8rem',
          zIndex: 99999,
          pointerEvents: pinned ? 'auto' : 'none',
          boxShadow: `0 8px 40px rgba(0,0,0,0.85), 0 0 28px ${intelData.colorBg}`,
        }}>
          {/* Top accent line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '8px 8px 0 0', background: `linear-gradient(90deg, transparent, ${intelData.color}, transparent)` }} />

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', borderBottom: `1px solid ${intelData.colorBg}`, paddingBottom: '0.45rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{intelData.icon}</span>
              <div>
                <div style={{ fontSize: '0.56rem', color: intelData.colorDim, fontFamily: 'JetBrains Mono,monospace', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 1 }}>// AGENT STRATEGY INTEL</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: intelData.color, fontFamily: 'JetBrains Mono,monospace', textShadow: `0 0 12px ${intelData.colorBg}` }}>{activeIntel}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontSize: '0.54rem', background: intelData.colorBg, border: `1px solid ${intelData.colorBorder}`, color: intelData.color, borderRadius: 4, padding: '2px 6px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap' }}>{intelData.role}</span>
              {pinned && <span onClick={() => setPinned(null)} style={{ fontSize: '0.55rem', color: '#ff3366', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', pointerEvents: 'auto' }}>✕ close</span>}
            </div>
          </div>

          {/* Description */}
          <p style={{ fontSize: '0.64rem', color: '#8fa8c8', fontFamily: 'JetBrains Mono,monospace', lineHeight: 1.6, margin: '0 0 0.5rem' }}>{intelData.description}</p>

          {/* Signals */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.53rem', color: '#3d4f6a', fontFamily: 'JetBrains Mono,monospace', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Signal Sources</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {intelData.signals.map(s => (
                <span key={s} style={{ fontSize: '0.58rem', background: intelData.colorBg, border: `1px solid ${intelData.colorBorder}`, color: intelData.colorDim, borderRadius: 3, padding: '1px 6px', fontFamily: 'JetBrains Mono,monospace' }}>{s}</span>
              ))}
            </div>
          </div>

          {/* Model + Edge */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '0.3rem 0.45rem' }}>
              <div style={{ fontSize: '0.52rem', color: '#3d4f6a', fontFamily: 'JetBrains Mono,monospace', textTransform: 'uppercase', marginBottom: 2 }}>Model</div>
              <div style={{ fontSize: '0.6rem', color: intelData.color, fontFamily: 'JetBrains Mono,monospace' }}>{intelData.model}</div>
            </div>
            <div style={{ background: intelData.colorBg, border: `1px solid ${intelData.colorBorder}`, borderRadius: 5, padding: '0.3rem 0.45rem' }}>
              <div style={{ fontSize: '0.52rem', color: '#3d4f6a', fontFamily: 'JetBrains Mono,monospace', textTransform: 'uppercase', marginBottom: 2 }}>Edge</div>
              <div style={{ fontSize: '0.6rem', color: intelData.color, fontFamily: 'JetBrains Mono,monospace', lineHeight: 1.4 }}>{intelData.edge}</div>
            </div>
          </div>

          {pinned && <div style={{ marginTop: 8, fontSize: '0.54rem', color: '#3d4f6a', fontFamily: 'JetBrains Mono,monospace', textAlign: 'center' }}>pinned · click card again or ✕ to close</div>}
        </div>,
        document.body
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

/* ─────────────────────────────── Byreal Tab ─────────────────────────── */
interface ByrealOverview { tvl: number; volume_24h_usd: number; fee_24h_usd: number; pools_count: number }
interface PerpSignal { coin: string; direction: string; price: string; rsi: number; score: number; category: string }

function ByrealTab() {
  const [overview, setOverview] = useState<ByrealOverview | null>(null);
  const [signals, setSignals] = useState<PerpSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'dex' | 'perps'>('dex');

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API}/api/byreal/overview`).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' })),
      fetch(`${API}/api/byreal/perps/signals`).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' })),
    ]).then(([ov, sg]) => {
      if (ov?.success && ov.data) {
        setOverview(ov.data);
      } else if (!ov?.success) {
        setError(ov?.error ?? 'Byreal CLI unavailable');
      }
      if (sg?.success) {
        const all = [
          ...(sg.data?.signals?.conservative ?? []),
          ...(sg.data?.signals?.aggressive ?? []),
        ].slice(0, 8);
        setSignals(all);
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${(n/1_000).toFixed(1)}K`;

  return (
    <div className="fade-in">
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.65rem' }}>
        {(['dex', 'perps'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className="neon-btn"
            style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem', background: subTab === t ? 'rgba(247,147,26,0.14)' : 'transparent', borderColor: subTab === t ? '#f7931a' : 'rgba(255,255,255,0.1)', color: subTab === t ? '#f7931a' : '#6b7fa3' }}>
            {t === 'dex' ? '🔄 CLMM DEX' : '📈 Perps Signals'}
          </button>
        ))}
        <button className="neon-btn" onClick={load} aria-label="Refresh Byreal data" style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', marginLeft: 'auto' }}>↻</button>
      </div>

      {loading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Fetching Byreal data...</p>}

      {!loading && error && (
        <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.25)', borderRadius: '6px' }}>
          <div className="mono-text" style={{ fontSize: '0.72rem', color: '#ff3366', marginBottom: '0.2rem' }}>⚠ Byreal SDK unavailable</div>
          <div className="mono-text text-muted" style={{ fontSize: '0.62rem' }}>{error}</div>
          <div className="mono-text text-muted" style={{ fontSize: '0.6rem', marginTop: '0.2rem' }}>Node.js required — will work in Railway production</div>
        </div>
      )}

      {!loading && !error && subTab === 'dex' && overview && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
            {[
              { label: 'TVL', value: fmt(overview.tvl), color: '#00e87a' },
              { label: 'Vol 24h', value: fmt(overview.volume_24h_usd), color: '#00d4ff' },
              { label: 'Fees 24h', value: fmt(overview.fee_24h_usd), color: '#f59e0b' },
              { label: 'Pools', value: String(overview.pools_count), color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} className="stat-chip">
                <span className="stat-chip-label">{s.label}</span>
                <span className="stat-chip-value" style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.65rem', background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.2)', borderRadius: '6px' }}>
            <span aria-hidden="true" style={{ fontSize: '0.9rem' }}>⛓</span>
            <div>
              <div className="mono-text" style={{ fontSize: '0.7rem', color: '#f7931a', fontWeight: 700 }}>Byreal CLMM — Solana</div>
              <div className="mono-text text-muted" style={{ fontSize: '0.62rem' }}>Live data via @byreal-io/byreal-cli · Agent Skills integrated</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && subTab === 'dex' && !overview && (
        <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>No DEX data received.</p>
      )}

      {!loading && !error && subTab === 'perps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto' }}>
          {signals.length === 0 && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>No perp signals available.</p>}
          {signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', borderRadius: '5px', background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${s.direction === 'Long' ? '#00e87a' : '#ff3366'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="mono-text" style={{ fontSize: '0.7rem', color: s.direction === 'Long' ? '#00e87a' : '#ff3366', fontWeight: 700 }}>{s.direction === 'Long' ? '▲' : '▼'}</span>
                <span className="mono-text" style={{ fontSize: '0.72rem', color: '#00d4ff' }}>{s.coin.replace('xyz:', '')}</span>
                <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>${s.price}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="mono-text text-muted" style={{ fontSize: '0.62rem' }}>RSI {s.rsi}</span>
                <span className="mono-text" style={{ fontSize: '0.68rem', color: s.score >= 60 ? '#00e87a' : '#f59e0b', fontWeight: 700 }}>score {s.score}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Benchmark Tab ─────────────────────────── */
interface BenchmarkAgent {
  name: string; total_decisions: number; buy_count: number; sell_count: number;
  hold_count: number; win_rate: number; avg_roi_pct: number;
  onchain_trades: number; reputation: number; erc8004_token_id: number | null;
  registry_address: string; explorer_url: string; network: string;
}

function BenchmarkTab() {
  const [agents, setAgents] = useState<BenchmarkAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/agents/benchmark`)
      .then(r => r.json())
      .then(d => { setAgents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const totalDecisions = agents.reduce((s, a) => s + a.total_decisions, 0);
  const totalOnchain   = agents.reduce((s, a) => s + a.onchain_trades, 0);

  return (
    <div className="fade-in">
      {/* Summary strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div className="stat-chip">
            <span className="stat-chip-label">Total Decisions</span>
            <span className="stat-chip-value" style={{ color: '#00d4ff' }}>{totalDecisions}</span>
          </div>
          <div className="stat-chip" style={{ background: 'rgba(247,147,26,0.08)', borderColor: 'rgba(247,147,26,0.2)' }}>
            <span className="stat-chip-label">On-Chain Verified</span>
            <span className="stat-chip-value" style={{ color: '#f7931a' }}>⛓ {totalOnchain}</span>
          </div>
        </div>
        <button className="neon-btn" onClick={load} aria-label="Refresh benchmark" style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem' }}>↻</button>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[70, 85, 60, 75].map(w => (
            <div key={w} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
              <div className="skeleton" style={{ height: 10, width: 110, flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 10, flex: 1 }} />
              <div className="skeleton" style={{ height: 10, width: `${w}px`, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '145px', overflowY: 'auto' }}>
          {agents.map(a => {
            const winColor = a.win_rate >= 60 ? '#00e87a' : a.win_rate >= 45 ? '#f59e0b' : '#ff3366';
            const roiColor = a.avg_roi_pct >= 0 ? '#00e87a' : '#ff3366';
            return (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.65rem', borderRadius: '6px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' }}>
                {/* Name */}
                <div className="mono-text" style={{ fontSize: '0.7rem', color: '#00d4ff', fontWeight: 700, minWidth: '110px' }}>{a.name}</div>

                {/* Decision breakdown */}
                <div style={{ display: 'flex', gap: '0.4rem', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span className="mono-text" style={{ fontSize: '0.62rem', color: '#00e87a' }}>▲{a.buy_count}</span>
                  <span className="mono-text" style={{ fontSize: '0.62rem', color: '#ff3366' }}>▼{a.sell_count}</span>
                  <span className="mono-text text-muted" style={{ fontSize: '0.62rem' }}>⏸{a.hold_count}</span>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="mono-text" style={{ fontSize: '0.65rem', color: winColor, fontWeight: 700 }}>W {a.win_rate}%</span>
                  <span className="mono-text" style={{ fontSize: '0.65rem', color: roiColor }}>ROI {a.avg_roi_pct >= 0 ? '+' : ''}{a.avg_roi_pct}%</span>
                  <span className="mono-text" style={{ fontSize: '0.6rem', color: '#f7931a' }}>⛓{a.onchain_trades}</span>
                  <span className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>REP {a.reputation}</span>
                </div>

                {/* Verify link */}
                <a href={a.explorer_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.6rem', color: '#f7931a', textDecoration: 'underline', flexShrink: 0, fontWeight: 600 }}>
                  verify ↗
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Registry proof */}
      {!loading && agents.length > 0 && (
        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(247,147,26,0.05)', border: '1px solid rgba(247,147,26,0.15)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem' }}>⛓</span>
          <div className="mono-text text-muted" style={{ fontSize: '0.6rem', lineHeight: 1.5 }}>
            ERC-8004 Identity Registry · Mantle Sepolia · Every decision permanently recorded
          </div>
        </div>
      )}
    </div>
  );
}


/* ─────────────────────────────── BottomPanel ─────────────────────────── */
type TabId = 'alpha' | 'rwa' | 'devtools' | 'economy' | 'benchmark';

export default function BottomPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('alpha');

  const TABS: { id: TabId; label: string }[] = [
    { id: 'alpha',     label: t('tab_alpha')     },
    { id: 'rwa',       label: t('tab_rwa')       },
    { id: 'devtools',  label: t('tab_devtools')  },
    { id: 'economy',   label: t('tab_economy')   },
    { id: 'benchmark', label: t('tab_benchmark') },
  ];

  return (
    <div className="panel bottom-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.78rem', marginRight: '0.25rem' }}>{t('insights_title')}</h3>
        <div role="tablist" aria-label="Insights sections" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {TABS.map(tb => (
            <button key={tb.id} role="tab" aria-selected={tab === tb.id} aria-controls={`tabpanel-${tb.id}`}
              onClick={() => setTab(tb.id)} className="neon-btn"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.65rem', background: tab === tb.id ? 'rgba(0,212,255,0.14)' : 'transparent', borderColor: tab === tb.id ? '#00d4ff' : 'rgba(255,255,255,0.1)', color: tab === tb.id ? '#00d4ff' : '#6b7fa3' }}>
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-label={TABS.find(tb => tb.id === tab)?.label} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'alpha'     && <AlphaTab />}
        {tab === 'rwa'       && <RWATab />}
        {tab === 'devtools'  && <DevToolsTab />}
        {tab === 'economy'   && <EconomyTab />}
        {tab === 'benchmark' && <BenchmarkTab />}
      </div>
    </div>
  );
}
