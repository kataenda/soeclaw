import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

interface AgentStat {
  name: string;
  pnl_usd: number;
  trades: number;
  win_rate: number;
  return_pct: number;
}

interface AlphaData {
  alpha_pct: number;
  ai_return_pct: number;
  btc_baseline_pct: number;
  total_pnl_usd: number;
  capital_usd: number;
  win_rate: number;
  sharpe_ratio: number;
  max_drawdown_usd: number;
  verified_onchain: number;
  total_decisions: number;
  proof_url: string;
  agents: AgentStat[];
  verdict: string;
}

const VERDICT_COLORS: Record<string, string> = {
  BEATING_MARKET:   '#00e87a',
  NEUTRAL:          '#f59e0b',
  UNDERPERFORMING:  '#ff3366',
  INSUFFICIENT_DATA:'#6b7fa3',
};

function useCountUpF(target: number, decimals = 2, duration = 1000) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setVal(parseFloat((target * p).toFixed(decimals)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, decimals, duration]);
  return val;
}

export default function AlphaScorecard() {
  const { t } = useTranslation();
  const [data, setData] = useState<AlphaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/api/cfo/alpha-scorecard`)
        .then(r => r.json())
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const alpha    = useCountUpF(data?.alpha_pct ?? 0, 2);
  const aiRet    = useCountUpF(data?.ai_return_pct ?? 0, 2);
  const btcRet   = useCountUpF(data?.btc_baseline_pct ?? 0, 2);
  const winRate  = useCountUpF(data?.win_rate ?? 0, 1);

  if (loading) {
    return (
      <div className="panel mono-text" style={{ padding: '0.65rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e87a', animation: 'pulse 1s infinite' }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{t('as_loading')}</span>
      </div>
    );
  }

  if (!data || typeof data.alpha_pct !== 'number') return null;

  const VERDICT_LABELS: Record<string, string> = {
    BEATING_MARKET:    t('as_verdict_beating'),
    NEUTRAL:           t('as_verdict_neutral'),
    UNDERPERFORMING:   t('as_verdict_under'),
    INSUFFICIENT_DATA: t('as_verdict_nodata'),
  };

  const agents = Array.isArray(data.agents) ? data.agents : [];
  const vcColor = VERDICT_COLORS[data.verdict] ?? VERDICT_COLORS.NEUTRAL;
  const vcLabel = VERDICT_LABELS[data.verdict] ?? t('as_verdict_neutral');
  const alphaColor = data.alpha_pct > 0 ? '#00e87a' : data.alpha_pct < -1 ? '#ff3366' : '#f59e0b';
  const maxAgentPnl = Math.max(...agents.map(a => Math.abs(a.pnl_usd)), 1);

  return (
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: alphaColor, boxShadow: `0 0 8px ${alphaColor}`, animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: alphaColor }}>ALPHA SCORECARD</span>
        </div>
        <span style={{
          fontSize: '0.56rem', padding: '1px 7px', borderRadius: 4, fontWeight: 700,
          background: `${vcColor}15`, border: `1px solid ${vcColor}40`, color: vcColor,
        }}>{vcLabel}</span>
      </div>

      {/* ── Alpha Number (hero) ── */}
      <div style={{ textAlign: 'center', padding: '0.5rem 0.25rem 0.3rem', background: `${alphaColor}08`, border: `1px solid ${alphaColor}20`, borderRadius: 7 }}>
        <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>{t('as_vs_btc')}</div>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: alphaColor, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1, letterSpacing: '-1px' }}>
          {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
        </div>
        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 3 }}>
          Mantle L2 · ERC-8004 · {data.verified_onchain} {t('as_onchain_proofs')}
        </div>
      </div>

      {/* ── AI vs BTC comparison ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
        {/* AI Return */}
        <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 5, padding: '0.35rem 0.45rem' }}>
          <div style={{ fontSize: '0.52rem', color: '#00e87a', letterSpacing: '0.5px', marginBottom: 2 }}>{t('as_ai_portfolio')}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00e87a', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {aiRet >= 0 ? '+' : ''}{aiRet.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 1 }}>
            {data.total_pnl_usd >= 0 ? '+' : ''}${Math.abs(data.total_pnl_usd).toFixed(0)} USD
          </div>
        </div>
        {/* BTC Baseline */}
        <div style={{ background: 'rgba(247,147,26,0.05)', border: '1px solid rgba(247,147,26,0.2)', borderRadius: 5, padding: '0.35rem 0.45rem' }}>
          <div style={{ fontSize: '0.52rem', color: '#f7931a', letterSpacing: '0.5px', marginBottom: 2 }}>{t('as_btc_baseline')}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f7931a', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {btcRet >= 0 ? '+' : ''}{btcRet.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 1 }}>{t('as_buy_hold')}</div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
        {[
          { label: t('as_win_rate'),  value: `${winRate.toFixed(1)}%`,       color: '#00d4ff' },
          { label: t('as_sharpe'),    value: data.sharpe_ratio.toFixed(2),   color: '#a78bfa' },
          { label: t('as_decisions'), value: `${data.total_decisions}`,       color: '#6b7fa3' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '0.3rem 0.2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
            <div style={{ fontSize: '0.48rem', color: 'var(--text-dim)', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.1, marginTop: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Agent Leaderboard ── */}
      {agents.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, padding: '0.35rem 0.4rem' }}>
          <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: '0.35rem', textTransform: 'uppercase' }}>{t('as_agent_perf')}</div>
          {agents.map((a, i) => {
            const barPct = (Math.abs(a.pnl_usd) / maxAgentPnl) * 100;
            const c = a.pnl_usd >= 0 ? '#00e87a' : '#ff3366';
            const medal = ['🥇', '🥈', '🥉'][i] ?? '  ';
            return (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: '0.6rem', minWidth: 16 }}>{medal}</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', minWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: c, borderRadius: 2, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: c, minWidth: 46, textAlign: 'right' }}>
                  {a.pnl_usd >= 0 ? '+' : ''}${Math.abs(a.pnl_usd).toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── On-chain Proof Link ── */}
      <a
        href={data.proof_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '0.3rem', borderRadius: 5, textDecoration: 'none',
          background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.25)',
          color: '#a78bfa', fontSize: '0.6rem', fontWeight: 600,
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.25)')}
      >
        ⛓ {t('as_verify')} — {data.verified_onchain} ERC-8004 proofs
      </a>
    </div>
  );
}
