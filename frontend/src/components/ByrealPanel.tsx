import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/TranslationContext';
import { API_URL } from '../config';

interface ByrealOverview { tvl: number; volume_24h_usd: number; fee_24h_usd: number; pools_count: number }
interface PerpSignal    { coin: string; direction: string; price: string; rsi: number; score: number; category?: string }
interface PoolItem      { poolName?: string; name?: string; tvl?: number; apr24h?: number; apy?: number; volume24h?: number; fee24h?: number; status?: string; tickSpacing?: number }
interface AgentSkill    { name: string; type: string; version: string; description?: string }
interface AgentEntry    { name: string; id: string; skills: AgentSkill[]; erc8004_token_id?: number }
interface ByrealThought { message: string; agent_name: string; msg_type: string }

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(1)}K`;

const fmtPrice = (p: string) => {
  const n = parseFloat(p);
  if (isNaN(n)) return p;
  return n >= 1000 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : n >= 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(5)}`;
};

const MOCK_LP: PoolItem[] = [
  { poolName: 'MNT/USDT',  tvl: 12480, apy: 18.4, status: 'in-range'  },
  { poolName: 'ETH/USDT',  tvl: 31200, apy: 9.7,  status: 'in-range'  },
  { poolName: 'MNT/ETH',   tvl: 8740,  apy: 24.1, status: 'out-range' },
];

const DEMO_SIGNALS: PerpSignal[] = [
  { coin: 'BTCUSDT', direction: 'Long',  price: '104850.00', rsi: 52, score: 78 },
  { coin: 'ETHUSDT', direction: 'Short', price: '2486.50',   rsi: 68, score: 63 },
  { coin: 'MNTUSDT', direction: 'Long',  price: '0.6481',    rsi: 38, score: 71 },
  { coin: 'SOLUSDT', direction: 'Long',  price: '148.20',    rsi: 44, score: 66 },
  { coin: 'BNBUSDT', direction: 'Short', price: '641.30',    rsi: 72, score: 55 },
];

export default function ByrealPanel() {
  const { t } = useTranslation();
  const [overview,    setOverview]    = useState<ByrealOverview | null>(null);
  const [signals,     setSignals]     = useState<PerpSignal[]>([]);
  const [pools,       setPools]       = useState<PoolItem[]>([]);
  const [agents,      setAgents]      = useState<AgentEntry[]>([]);
  const [activity,    setActivity]    = useState<ByrealThought[]>([]);
  const [poolsErr,    setPoolsErr]    = useState(false);
  const [signalsErr,  setSignalsErr]  = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'perps' | 'skills' | 'realclaw'>('perps');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/byreal/overview`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/byreal/perps/signals`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/byreal/pools`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/agents/skills`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/thought-stream`).then(r => r.json()).catch(() => null),
    ]).then(([ov, sg, pl, ag, ts]) => {
      // Overview
      if (ov?.success && ov.data) setOverview(ov.data);

      // Perps signals
      if (sg?.success && sg.data) {
        const all: PerpSignal[] = [
          ...(sg.data?.signals?.conservative ?? []),
          ...(sg.data?.signals?.moderate     ?? []),
          ...(sg.data?.signals?.aggressive   ?? []),
        ];
        setSignals(all.slice(0, 10));
        setSignalsErr(false);
      } else {
        setSignalsErr(true);
      }

      // Pools
      if (pl?.success && Array.isArray(pl.data) && pl.data.length > 0) {
        setPools(pl.data.slice(0, 6));
        setPoolsErr(false);
      } else {
        setPoolsErr(true);
      }

      // Agent skills registry
      if (ag?.agents) setAgents(ag.agents);

      // BYREAL agent activity from thought stream
      if (Array.isArray(ts)) {
        const byreal = ts
          .filter((th: ByrealThought) => th.agent_name === 'BYREAL' || th.message?.includes('[BYREAL'))
          .slice(0, 8);
        setActivity(byreal);
      }

      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  const displaySignals = signals.length > 0 ? signals : DEMO_SIGNALS;
  const displayPools   = pools.length > 0 ? pools : MOCK_LP;
  const longCount      = displaySignals.filter(s => s.direction === 'Long').length;
  const shortCount     = displaySignals.filter(s => s.direction === 'Short').length;
  const avgScore       = displaySignals.length ? Math.round(displaySignals.reduce((s, x) => s + x.score, 0) / displaySignals.length) : 0;
  const totalSkills    = agents.reduce((s, a) => s + a.skills.length, 0);

  return (
    <div className="panel mono-text byreal-side-panel"
      style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0.7rem' }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f7931a', boxShadow: '0 0 8px rgba(247,147,26,0.8)', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f7931a', letterSpacing: '0.5px' }}>BYREAL HUB</span>
            <span style={{ fontSize: '0.52rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', color: '#00e87a' }}>{t('bp_defi_tag')}</span>
          </div>
          <button onClick={load} style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>↻</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, background: 'rgba(0,0,0,0.35)', padding: 2, borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
          {([
            { id: 'perps',    label: t('bp_tab_perps'),    color: '#f7931a' },
            { id: 'skills',   label: t('bp_tab_skills'),   color: '#00d4ff' },
            { id: 'realclaw', label: t('bp_tab_realclaw'), color: '#a78bfa' },
          ] as const).map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              style={{ fontSize: '0.6rem', padding: '3px 2px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textAlign: 'center',
                background: tabItem.id === tab ? `${tabItem.color}20` : 'transparent',
                border: tabItem.id === tab ? `1px solid ${tabItem.color}55` : '1px solid transparent',
                color: tabItem.id === tab ? tabItem.color : 'var(--text-muted)',
              }}>{tabItem.label}</button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f7931a', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t('bp_connecting')}</span>
          </div>
        )}

        {/* ──────── PERPS CLI TAB ──────── */}
        {!loading && tab === 'perps' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 6, flexShrink: 0 }}>
              {[
                { label: t('bp_long'),  value: String(longCount),  color: '#00e87a' },
                { label: t('bp_short'), value: String(shortCount), color: '#ff3366' },
                { label: t('bp_score'), value: String(avgScore),   color: avgScore >= 65 ? '#00e87a' : '#f59e0b' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '0.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 1 }}>{s.label}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Signals */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {displaySignals.map((s, i) => <SignalCard key={i} signal={s} />)}
              {signalsErr && (
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,147,26,0.55)', textAlign: 'center', padding: '0.3rem', background: 'rgba(247,147,26,0.04)', border: '1px solid rgba(247,147,26,0.1)', borderRadius: 4 }}>
                  ⚠ Live CLI unavailable — showing demo signals
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, marginTop: 5, fontSize: '0.55rem', color: 'var(--text-dim)', textAlign: 'center' }}>
              @byreal-io/byreal-perps-cli · auto-refresh 60s
            </div>
          </div>
        )}

        {/* ──────── AGENT SKILLS TAB ──────── */}
        {!loading && tab === 'skills' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>

            {/* DEX stats */}
            {overview && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flexShrink: 0 }}>
                {[
                  { label: 'TVL',      value: fmt(overview.tvl),            color: '#00e87a' },
                  { label: 'Vol 24h',  value: fmt(overview.volume_24h_usd), color: '#00d4ff' },
                  { label: 'Fees 24h', value: fmt(overview.fee_24h_usd),    color: '#f59e0b' },
                  { label: 'Pools',    value: String(overview.pools_count), color: '#a78bfa' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 5, padding: '0.3rem 0.4rem' }}>
                    <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: s.color, marginTop: 1 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* CLMM Pools */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('bp_lp_positions')}</span>
                {!poolsErr && pools.length > 0 && (
                  <span style={{ fontSize: '0.48rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.2)', color: '#00e87a' }}>LIVE</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {displayPools.map((lp, i) => {
                  const name   = lp.poolName ?? lp.name ?? `Pool ${i + 1}`;
                  const apyVal = lp.apy ?? lp.apr24h ?? 0;
                  const inRange = (lp.status ?? 'in-range') !== 'out-range';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.025)', border: `1px solid ${inRange ? 'rgba(0,232,122,0.15)' : 'rgba(255,51,102,0.15)'}`, borderRadius: 5, padding: '0.3rem 0.4rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#00d4ff' }}>{name}</div>
                        {lp.tvl != null && (
                          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 1 }}>TVL {fmt(lp.tvl)}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#00e87a' }}>{apyVal.toFixed(1)}% APY</div>
                        <div style={{ fontSize: '0.55rem', color: inRange ? '#00e87a' : '#ff3366' }}>{inRange ? 'in-range' : 'out-range'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* BYREAL Agent Activity */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{t('bp_recent_swaps')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', maxHeight: '100%' }}>
                {activity.length > 0 ? activity.map((act, i) => {
                  const isPerps = act.message.includes('byreal-perps');
                  const isSwap  = act.message.includes('byreal_swap') || act.message.includes('swap preview');
                  const color   = isPerps ? '#f7931a' : isSwap ? '#00d4ff' : '#a78bfa';
                  const label   = isPerps ? 'PERPS' : isSwap ? 'SWAP' : 'SKILL';
                  const body    = act.message.replace('[BYREAL SKILLS] ', '').slice(0, 80);
                  return (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '0.3rem 0.4rem', border: `1px solid rgba(255,255,255,0.05)`, borderLeft: `3px solid ${color}55` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span style={{ fontSize: '0.48rem', padding: '1px 4px', borderRadius: 3, background: `${color}15`, border: `1px solid ${color}40`, color, fontWeight: 700 }}>{label}</span>
                        <span style={{ fontSize: '0.55rem', color: '#a78bfa' }}>BYREAL</span>
                      </div>
                      <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{body}</div>
                    </div>
                  );
                }) : (
                  // Fallback mock swaps when no activity yet
                  [
                    { from: 'USDT', to: 'MNT',   amount: '$2,000',   out: '3,076 MNT', agent: 'AlphaQuant',   ts: '2m ago'  },
                    { from: 'ETH',  to: 'USDT',  amount: '1.2 ETH',  out: '$3,048',    agent: 'RiskManager',  ts: '18m ago' },
                    { from: 'MNT',  to: 'USDT',  amount: '5,000 MNT', out: '$3,250',   agent: 'MacroAnalyzer', ts: '47m ago' },
                  ].map((sw, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '0.3rem 0.4rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: '#e0e6f0' }}>{sw.from} → {sw.to}</div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{sw.amount} → {sw.out}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.58rem', color: '#a78bfa' }}>{sw.agent}</div>
                        <div style={{ fontSize: '0.53rem', color: 'var(--text-dim)' }}>{sw.ts}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ──────── REALCLAW TAB ──────── */}
        {!loading && tab === 'realclaw' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>

            {/* Identity card */}
            <div style={{ flexShrink: 0, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 7, padding: '0.5rem 0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(167,139,250,0.15)', border: '1.5px solid rgba(167,139,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🤖</div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a78bfa' }}>RealClaw Agent</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>OpenClaw-based · Byreal Skills installed</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {[
                  { label: 'Agents',   value: agents.length > 0 ? String(agents.length) : '4',   color: '#a78bfa' },
                  { label: 'Skills',   value: totalSkills > 0 ? String(totalSkills) : '—',         color: '#00d4ff' },
                  { label: 'Network',  value: 'Mantle',   color: '#00e87a' },
                  { label: 'ERC-8004', value: 'Active',   color: '#f7931a' },
                ].map(m => (
                  <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '0.25rem 0.35rem' }}>
                    <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{m.label}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live agent + skill registry */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{t('bp_installed_skills')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: '100%' }}>
                {agents.length > 0 ? agents.map(agent => (
                  <div key={agent.id}>
                    {/* Agent header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#00d4ff' }}>{agent.name}</span>
                      {agent.erc8004_token_id != null && (
                        <span style={{ fontSize: '0.48rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.3)', color: '#f7931a', fontWeight: 700 }}>
                          ERC-8004 #{agent.erc8004_token_id}
                        </span>
                      )}
                    </div>
                    {/* Skills */}
                    {agent.skills.map(sk => {
                      const TYPE_COLOR: Record<string, string> = { strategy: '#00e87a', data: '#00d4ff', risk: '#f59e0b', signal: '#a78bfa' };
                      const color = TYPE_COLOR[sk.type?.toLowerCase()] ?? '#6b7fa3';
                      return (
                        <div key={sk.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(167,139,250,0.1)', borderLeft: `3px solid ${color}66`, borderRadius: 5, padding: '0.25rem 0.4rem', marginBottom: 2 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#c0cce0', fontFamily: 'JetBrains Mono,monospace' }}>{sk.name}</div>
                            {sk.description && (
                              <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sk.description}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
                            <div style={{ fontSize: '0.52rem', color, background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 3, padding: '1px 4px' }}>{sk.type}</div>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: 1 }}>v{sk.version}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )) : (
                  // Fallback static skills
                  [
                    { skill: 'byreal_swap',      desc: 'Execute CLMM swaps on Byreal DEX',        type: 'strategy' },
                    { skill: 'byreal_lp_add',    desc: 'Add liquidity to concentrated pools',     type: 'strategy' },
                    { skill: 'byreal_lp_remove', desc: 'Remove LP when position goes out-range',  type: 'risk'     },
                    { skill: 'byreal_perps',     desc: 'Open/close perpetual futures positions',  type: 'strategy' },
                    { skill: 'mantle_record',    desc: 'Record decisions on-chain via ERC-8004',  type: 'data'     },
                    { skill: 'price_feed',       desc: 'Bybit WebSocket real-time price stream',  type: 'data'     },
                  ].map(sk => {
                    const TYPE_COLOR: Record<string, string> = { strategy: '#00e87a', data: '#00d4ff', risk: '#f59e0b' };
                    const color = TYPE_COLOR[sk.type] ?? '#6b7fa3';
                    return (
                      <div key={sk.skill} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(167,139,250,0.1)', borderLeft: `3px solid rgba(167,139,250,0.4)`, borderRadius: 5, padding: '0.3rem 0.4rem', marginBottom: 2 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#a78bfa', fontFamily: 'JetBrains Mono,monospace' }}>{sk.skill}</div>
                          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sk.desc}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
                          <div style={{ fontSize: '0.52rem', color, background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 3, padding: '1px 4px' }}>{sk.type}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ flexShrink: 0, marginTop: '0.4rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>byreal-agent-skills · byreal-perps-cli</span>
        <span style={{ fontSize: '0.52rem', color: 'rgba(247,147,26,0.45)' }}>Mantle · Solana</span>
      </div>
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ signal: s }: { signal: PerpSignal }) {
  const isLong     = s.direction === 'Long';
  const dirColor   = isLong ? '#00e87a' : '#ff3366';
  const coin       = s.coin.replace('xyz:', '').replace('/USDT', '').replace('USDT', '');
  const scoreColor = s.score >= 70 ? '#00e87a' : s.score >= 55 ? '#f59e0b' : '#6b7fa3';
  return (
    <div style={{ background: isLong ? 'rgba(0,232,122,0.05)' : 'rgba(255,51,102,0.05)', border: `1px solid ${isLong ? 'rgba(0,232,122,0.15)' : 'rgba(255,51,102,0.15)'}`, borderLeft: `3px solid ${dirColor}`, borderRadius: 6, padding: '0.4rem 0.5rem', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: dirColor, background: `${dirColor}15`, borderRadius: 3, padding: '1px 5px' }}>{isLong ? '▲ LONG' : '▼ SHORT'}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e0e6f0' }}>{coin}</span>
        </div>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{fmtPrice(s.price)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>score</span>
          <div style={{ width: 44, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${s.score}%`, background: scoreColor, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: scoreColor }}>{s.score}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>RSI</span>
          <span style={{ fontSize: '0.62rem', fontWeight: 600, color: s.rsi >= 70 ? '#ff3366' : s.rsi <= 30 ? '#00e87a' : 'var(--text-muted)' }}>{s.rsi}</span>
        </div>
      </div>
    </div>
  );
}
