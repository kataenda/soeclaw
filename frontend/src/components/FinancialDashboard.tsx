import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PnLData {
  gross_profit_usd: number; gross_loss_usd: number;
  net_pnl_usd: number; net_pnl_pct: number; trade_count: number;
  best_trade: { symbol: string; pnl_usd: number; action: string };
  worst_trade: { symbol: string; pnl_usd: number; action: string };
}
interface BalanceSheet {
  assets: { crypto_btc: number; crypto_eth: number; crypto_mnt: number; rwa_yield: number; stablecoin: number; total: number };
  liabilities: number; net_worth: number; capital_deployed: number; capital_idle: number;
}
interface FinancialReport {
  pnl: PnLData;
  balance_sheet: BalanceSheet;
  cash_flow: { operating: number; investing: number; financing: number; net: number };
  monthly_pnl: { month: string; pnl_usd: number }[];
  generated_at: string;
}

interface BudgetItem {
  id: number; category: string; limit_usd: number; spent_usd: number;
  remaining_usd: number; utilization_pct: number; status: 'OK' | 'WARN' | 'OVER';
}
interface BudgetData {
  budgets: BudgetItem[];
  summary: { total_limit: number; total_spent: number; utilization_pct: number };
  forecast: { next_month_spend: number; next_month_return: number; confidence_pct: number; trend: string };
}

interface RiskData {
  var: { var_95_usd: number; var_99_usd: number; method: string; portfolio_vol_pct: number };
  drawdown: { max_drawdown_usd: number; current_drawdown_usd: number; drawdown_limit_pct: number; status: string };
  volatility: Record<string, number>;
  exposure_limits: { symbol: string; exposure_pct: number; limit_pct: number; status: string }[];
  circuit_breaker: { active: boolean; trigger: string; action: string };
}

interface TreasuryHolding { qty: number; price_usd: number; value_usd: number; alloc_pct: number }
interface TreasuryData {
  holdings: Record<string, TreasuryHolding>;
  total_value_usd: number; total_value_idr: number;
  fx_rates: Record<string, number>;
  stablecoin_yields: Record<string, number>;
  recommendations: { priority: string; action: string; from: string; to: string; amount_usd: number; apy?: number | null; reason: string }[];
  on_ramp: { options: string[]; best_idr_rate: string };
}

interface AuditEvent {
  id: string; timestamp: string; event_type: string; entity: string;
  action: string; symbol?: string | null; tx_hash?: string | null;
  regulatory_category: string; on_chain: boolean; compliant: boolean;
}
interface AuditData {
  events: AuditEvent[];
  summary: { total_events: number; trade_events: number; on_chain_events: number; compliance_score: number; jurisdiction: string; audited_at: string };
}

interface Stock { symbol: string; name: string; price: number; change_24h: number; sector: string }
interface Bond  { name: string; ticker: string; yield_pct: number; duration: number; rating: string }
interface FxRate { pair: string; rate: number; change_24h: number; volatility: string }
interface MultiAssetData {
  stocks: Stock[]; bonds: Bond[]; fx: FxRate[];
  portfolio: {
    allocation: Record<string, number>;
    allocation_usd: Record<string, number>;
    diversification_score: number;
    recommendation: string;
  };
  correlations: Record<string, number>;
  ai_insight: string;
}

interface TimelineEvent {
  id: number; timestamp: string; agent: string;
  action: string; symbol: string; entry_price: number;
  current_price: number; confidence: number;
  pnl_pct: number; pnl_usd: number;
  tx_hash: string | null; explorer_url: string | null;
  verified: boolean; outcome: 'WIN' | 'LOSS' | 'OPEN';
}
interface TimelineData {
  events: TimelineEvent[];
  stats: { total: number; verified: number; wins: number; win_rate: number; total_pnl_usd: number };
}

interface AlertItem {
  type: string; symbol: string; title: string;
  message: string; severity: string; timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt   = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => `$${fmt(Math.abs(n))}`;
const sign  = (n: number) => (n >= 0 ? '+' : '-');
const pnlColor = (n: number) => n >= 0 ? '#00e87a' : '#ff3366';
const statusColor: Record<string, string> = { OK: '#00e87a', WARN: '#f59e0b', OVER: '#ff3366', BREACH: '#ff3366', NORMAL: '#00e87a' };

function MiniBar({ pct, color, max = 100 }: { pct: number; color: string; max?: number }) {
  return (
    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, (pct / max) * 100)}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function Card({ title, children, color = '#a78bfa' }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: `${color}06`, border: `1px solid ${color}18`, borderRadius: 6, padding: '0.55rem 0.65rem' }}>
      <div style={{ fontSize: '0.57rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>{title}</div>
      {children}
    </div>
  );
}

// ── Tab Components ─────────────────────────────────────────────────────────────

function ReportTab() {
  const [data, setData] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/financial-report`)
      .then(r => r.json())
      .then(d => { if (d?.pnl && d?.balance_sheet) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.pnl || !data?.balance_sheet) return <ErrorMsg />;

  const { pnl, balance_sheet: bs, cash_flow: cf } = data;
  const monthly = Array.isArray(data.monthly_pnl) ? data.monthly_pnl : [];
  const maxBar = Math.max(...monthly.map(m => Math.abs(m.pnl_usd)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* P&L Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {[
          { label: 'Net P&L', value: `${sign(pnl.net_pnl_usd)}${fmtUsd(pnl.net_pnl_usd)}`, sub: `${sign(pnl.net_pnl_pct)}${fmt(pnl.net_pnl_pct)}%`, color: pnlColor(pnl.net_pnl_usd) },
          { label: 'Gross Profit', value: `+${fmtUsd(pnl.gross_profit_usd)}`, sub: `${pnl.trade_count} trades`, color: '#00e87a' },
          { label: 'Gross Loss', value: `-${fmtUsd(Math.abs(pnl.gross_loss_usd))}`, sub: 'realized losses', color: '#ff3366' },
        ].map(({ label, value, sub, color }) => (
          <Card key={label} title={label} color={color}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
          </Card>
        ))}
      </div>

      {/* Monthly P&L Bar Chart */}
      {monthly.length > 0 && (
        <Card title="Monthly P&L">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
            {monthly.slice(-8).map(m => {
              const h = Math.max(4, (Math.abs(m.pnl_usd) / maxBar) * 58);
              const c = pnlColor(m.pnl_usd);
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', height: h, background: `${c}55`, border: `1px solid ${c}88`, borderRadius: 2 }} title={`${m.month}: ${sign(m.pnl_usd)}$${Math.abs(m.pnl_usd).toFixed(0)}`} />
                  <span style={{ fontSize: '0.45rem', color: 'var(--text-dim)', transform: 'rotate(-30deg)', transformOrigin: 'top right' }}>{m.month?.slice(5) ?? ''}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Balance Sheet */}
      <Card title="Balance Sheet — Assets" color="#00d4ff">
        {Object.entries(bs.assets).filter(([k]) => k !== 'total').map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: 90 }}>{k.replace(/_/g, ' ').replace('crypto ', '').toUpperCase()}</span>
            <MiniBar pct={v as number} color="#00d4ff" max={bs.assets.total} />
            <span style={{ fontSize: '0.62rem', color: '#00d4ff', minWidth: 60, textAlign: 'right' }}>${fmt(v as number, 0)}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(0,212,255,0.15)', paddingTop: 4, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.6rem', color: '#00d4ff', fontWeight: 700 }}>NET WORTH</span>
          <span style={{ fontSize: '0.72rem', color: '#00d4ff', fontWeight: 700 }}>${fmt(bs.net_worth, 0)}</span>
        </div>
      </Card>

      {/* Cash Flow */}
      <Card title="Cash Flow Statement" color="#f7931a">
        {[['Operating', cf.operating], ['Investing', cf.investing], ['Financing', cf.financing], ['Net Cash Flow', cf.net]].map(([label, val]) => (
          <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{label as string}</span>
            <span style={{ fontSize: '0.62rem', fontWeight: label === 'Net Cash Flow' ? 700 : 400, color: pnlColor(val as number) }}>
              {sign(val as number)}{fmtUsd(val as number)}
            </span>
          </div>
        ))}
      </Card>

      <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', textAlign: 'right' }}>
        Generated {new Date(data.generated_at).toLocaleString()}
      </div>
    </div>
  );
}

function BudgetTab() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/budget`)
      .then(r => r.json())
      .then(d => { if (d?.budgets && d?.summary) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.budgets || !data?.summary) return <ErrorMsg />;

  const budgets = Array.isArray(data.budgets) ? data.budgets : [];
  const { summary, forecast } = data;
  const trendColor = forecast.trend === 'UP' ? '#00e87a' : '#f59e0b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <Card title="Total Budget" color="#a78bfa">
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#a78bfa' }}>${fmt(summary.total_limit, 0)}</div>
          <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>{fmt(summary.utilization_pct, 1)}% utilized</div>
          <MiniBar pct={summary.utilization_pct} color={summary.utilization_pct > 80 ? '#ff3366' : '#a78bfa'} />
        </Card>
        <Card title="Spent This Month" color="#f7931a">
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f7931a' }}>${fmt(summary.total_spent, 0)}</div>
          <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>${fmt(summary.total_limit - summary.total_spent, 0)} remaining</div>
        </Card>
      </div>

      {/* Budget Bars */}
      <Card title="Budget Allocation vs Spend">
        {budgets.map(b => (
          <div key={b.id} style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{b.category}</span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ fontSize: '0.55rem', padding: '0px 4px', borderRadius: 3, background: `${statusColor[b.status] ?? '#888'}15`, color: statusColor[b.status] ?? '#888', border: `1px solid ${statusColor[b.status] ?? '#888'}30` }}>{b.status}</span>
                <span style={{ fontSize: '0.62rem', color: statusColor[b.status] ?? '#888' }}>{fmt(b.utilization_pct, 0)}%</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
              <div style={{ position: 'absolute', height: '100%', width: `${Math.min(100, b.utilization_pct)}%`, background: statusColor[b.status] ?? '#888', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
              <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>${fmt(b.spent_usd, 0)} spent</span>
              <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>${fmt(b.limit_usd, 0)} limit</span>
            </div>
          </div>
        ))}
      </Card>

      {/* AI Forecast */}
      <Card title="AI Forecast — Next Month" color={trendColor}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>EXPECTED SPEND</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f7931a' }}>${fmt(forecast.next_month_spend, 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>EXPECTED RETURN</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00e87a' }}>${fmt(forecast.next_month_return, 0)}</div>
          </div>
        </div>
        <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>Confidence:</span>
          <MiniBar pct={forecast.confidence_pct} color={trendColor} />
          <span style={{ fontSize: '0.6rem', color: trendColor, minWidth: 28 }}>{forecast.confidence_pct}%</span>
          <span style={{ fontSize: '0.57rem', color: trendColor, fontWeight: 700 }}>TREND {forecast.trend}</span>
        </div>
      </Card>
    </div>
  );
}

function RiskTab() {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/risk-model`)
      .then(r => r.json())
      .then(d => { if (d?.var && d?.drawdown) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.var || !data?.drawdown) return <ErrorMsg />;

  const exposureLimits = Array.isArray(data.exposure_limits) ? data.exposure_limits : [];
  const cbColor = data.circuit_breaker?.active ? '#ff3366' : '#00e87a';
  const ddColor = statusColor[data.drawdown.status] ?? '#f59e0b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Circuit Breaker Banner */}
      <div style={{ padding: '0.45rem 0.65rem', background: `${cbColor}10`, border: `1px solid ${cbColor}35`, borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cbColor, boxShadow: `0 0 8px ${cbColor}`, animation: data.circuit_breaker.active ? 'pulse 0.8s infinite' : 'none', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: cbColor }}>CIRCUIT BREAKER {data.circuit_breaker.active ? 'ACTIVE' : 'STANDBY'}</div>
          <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>{data.circuit_breaker.action}</div>
        </div>
      </div>

      {/* VaR Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <Card title="VaR 95% (1-day)" color="#f59e0b">
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ff3366' }}>{fmtUsd(data.var.var_95_usd)}</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>max expected loss</div>
        </Card>
        <Card title="VaR 99% (1-day)" color="#ff3366">
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ff3366' }}>{fmtUsd(data.var.var_99_usd)}</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)'  }}>extreme scenario</div>
        </Card>
      </div>

      <Card title={`Portfolio Volatility — ${fmt(data.var.portfolio_vol_pct, 2)}% (24h)`} color="#f59e0b">
        {Object.entries(data.volatility).map(([sym, vol]) => (
          <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: 80 }}>{sym}</span>
            <MiniBar pct={vol as number} color={vol > 5 ? '#ff3366' : vol > 3 ? '#f59e0b' : '#00e87a'} max={10} />
            <span style={{ fontSize: '0.62rem', color: '#f59e0b', minWidth: 36, textAlign: 'right' }}>{fmt(vol as number, 2)}%</span>
          </div>
        ))}
        <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: 4 }}>{data.var.method}</div>
      </Card>

      {/* Drawdown */}
      <Card title="Drawdown Analysis" color={ddColor}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>MAX DRAWDOWN</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ff3366' }}>{fmtUsd(data.drawdown.max_drawdown_usd)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>CURRENT</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: ddColor }}>{fmtUsd(data.drawdown.current_drawdown_usd)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, background: `${ddColor}15`, border: `1px solid ${ddColor}35`, fontSize: '0.62rem', fontWeight: 700, color: ddColor }}>{data.drawdown.status}</div>
        </div>
        <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>Limit: {data.drawdown.drawdown_limit_pct}% of capital</div>
      </Card>

      {/* Exposure Limits */}
      {exposureLimits.length > 0 && (
        <Card title="Per-Asset Exposure">
          {exposureLimits.map(e => (
            <div key={e.symbol} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: 80 }}>{e.symbol}</span>
              <MiniBar pct={e.exposure_pct} color={statusColor[e.status] ?? '#00e87a'} max={50} />
              <span style={{ fontSize: '0.62rem', color: statusColor[e.status] ?? '#00e87a', minWidth: 34, textAlign: 'right' }}>{fmt(e.exposure_pct, 1)}%</span>
              <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', minWidth: 30 }}>/{e.limit_pct}%</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function TreasuryTab() {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/treasury`)
      .then(r => r.json())
      .then(d => { if (d?.holdings && d?.fx_rates) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.holdings || !data?.fx_rates) return <ErrorMsg />;

  const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  const priorityColor: Record<string, string> = { HIGH: '#ff3366', MEDIUM: '#f59e0b', LOW: '#00d4ff' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Total Value */}
      <Card title="Total Treasury Value" color="#00e87a">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00e87a' }}>${fmt(data.total_value_usd, 0)}</div>
            <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>USD</div>
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f7931a' }}>Rp {data.total_value_idr.toLocaleString()}</div>
            <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>IDR equiv.</div>
          </div>
        </div>
      </Card>

      {/* Holdings */}
      <Card title="Asset Holdings" color="#00d4ff">
        {Object.entries(data.holdings).map(([asset, h]) => (
          <div key={asset} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#00d4ff', minWidth: 40 }}>{asset}</span>
            <MiniBar pct={h.alloc_pct} color="#00d4ff" />
            <span style={{ fontSize: '0.57rem', color: 'var(--text-muted)', minWidth: 28, textAlign: 'center' }}>{h.alloc_pct}%</span>
            <span style={{ fontSize: '0.62rem', color: '#00d4ff', minWidth: 60, textAlign: 'right' }}>${fmt(h.value_usd, 0)}</span>
          </div>
        ))}
      </Card>

      {/* FX Rates */}
      <Card title="FX Rates" color="#a78bfa">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 0.8rem' }}>
          {Object.entries(data.fx_rates).map(([pair, rate]) => (
            <div key={pair} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{pair}</span>
              <span style={{ fontSize: '0.62rem', color: '#a78bfa', fontWeight: 600 }}>{typeof rate === 'number' && rate > 100 ? rate.toLocaleString() : fmt(rate, 4)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Stablecoin Yields */}
      <Card title="Stablecoin Yields (APY)" color="#00e87a">
        {Object.entries(data.stablecoin_yields).map(([name, apy]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flex: 1 }}>{name}</span>
            <MiniBar pct={apy as number} color="#00e87a" max={10} />
            <span style={{ fontSize: '0.65rem', color: '#00e87a', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{apy}%</span>
          </div>
        ))}
      </Card>

      {/* Recommendations */}
      {recs.length > 0 && (
        <Card title="AI Treasury Recommendations" color="#f7931a">
          {recs.map((r, i) => (
            <div key={i} style={{ marginBottom: '0.5rem', padding: '0.35rem 0.45rem', background: `${priorityColor[r.priority] ?? '#888'}08`, border: `1px solid ${priorityColor[r.priority] ?? '#888'}22`, borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: '0.55rem', padding: '0px 4px', borderRadius: 3, background: `${priorityColor[r.priority]}18`, color: priorityColor[r.priority] ?? '#888', border: `1px solid ${priorityColor[r.priority]}35`, fontWeight: 700 }}>{r.priority}</span>
                <span style={{ fontSize: '0.6rem', color: '#00d4ff', fontWeight: 600 }}>{r.action}: {r.from} → {r.to}</span>
                <span style={{ fontSize: '0.6rem', color: '#00e87a', marginLeft: 'auto' }}>${fmt(r.amount_usd, 0)}</span>
              </div>
              <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>{r.reason}</div>
              {r.apy && <div style={{ fontSize: '0.57rem', color: '#00e87a', marginTop: 1 }}>Expected APY: {r.apy}%</div>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function AuditTab() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'TRADE' | 'BLOCKCHAIN_RECORD'>('ALL');

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/audit-trail`)
      .then(r => r.json())
      .then(d => { if (d?.events && d?.summary) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.events || !data?.summary) return <ErrorMsg />;

  const { summary } = data;
  const events = Array.isArray(data.events) ? data.events : [];
  const filtered = filter === 'ALL' ? events : events.filter(e => e.event_type === filter);
  const csColor = summary.compliance_score >= 90 ? '#00e87a' : summary.compliance_score >= 70 ? '#f59e0b' : '#ff3366';
  const typeColor: Record<string, string> = { TRADE: '#00d4ff', BLOCKCHAIN_RECORD: '#a78bfa' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Compliance Score */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        <Card title="Compliance Score" color={csColor}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: csColor, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(summary.compliance_score, 1)}%</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{summary.jurisdiction}</div>
        </Card>
        <Card title="Total Events" color="#00d4ff">
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00d4ff' }}>{summary.total_events}</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{summary.trade_events} trades</div>
        </Card>
        <Card title="On-Chain Records" color="#a78bfa">
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#a78bfa' }}>{summary.on_chain_events}</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Mantle L2</div>
        </Card>
      </div>

      {/* Filter Buttons */}
      <div style={{ display: 'flex', gap: 5 }}>
        {(['ALL', 'TRADE', 'BLOCKCHAIN_RECORD'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flex: 1, fontSize: '0.58rem', padding: '0.22rem', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
            background: filter === f ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${filter === f ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.07)'}`,
            color: filter === f ? '#a78bfa' : '#6b7fa3',
          }}>{f === 'BLOCKCHAIN_RECORD' ? 'ON-CHAIN' : f}</button>
        ))}
      </div>

      {/* Event List */}
      <Card title={`Audit Events (${filtered.length})`} color="#a78bfa">
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filtered.slice(0, 40).map(e => (
            <div key={e.id} style={{ padding: '0.3rem 0.4rem', background: 'rgba(255,255,255,0.02)', borderRadius: 3, borderLeft: `2px solid ${typeColor[e.event_type] ?? '#888'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.55rem', color: typeColor[e.event_type] ?? '#888', fontWeight: 700 }}>{e.id}</span>
                  <span style={{ fontSize: '0.55rem', color: e.on_chain ? '#00e87a' : '#6b7fa3' }}>{e.on_chain ? '⛓ ON-CHAIN' : '○ OFF-CHAIN'}</span>
                </div>
                <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>
                  {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'}
                </span>
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#6b7fa3' }}>{e.entity}</span> — {e.action}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MultiAssetTab() {
  const [data, setData] = useState<MultiAssetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/multiasset`)
      .then(r => r.json())
      .then(d => { if (d?.stocks && d?.portfolio) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.stocks || !data?.portfolio) return <ErrorMsg />;

  const stocks = Array.isArray(data.stocks) ? data.stocks : [];
  const bonds  = Array.isArray(data.bonds)  ? data.bonds  : [];
  const fx     = Array.isArray(data.fx)     ? data.fx     : [];
  const { portfolio } = data;
  const divColor = portfolio.diversification_score >= 70 ? '#00e87a' : portfolio.diversification_score >= 50 ? '#f59e0b' : '#ff3366';
  const allocColors: Record<string, string> = {
    crypto: '#f7931a', stocks: '#00d4ff', bonds: '#00e87a', rwa: '#a78bfa', fx_cash: '#6b7fa3',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Diversification Score */}
      <Card title="Portfolio Diversification" color={divColor}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: divColor, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{portfolio.diversification_score}</div>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>/100</div>
          </div>
          <div style={{ flex: 1 }}>
            {Object.entries(portfolio.allocation).map(([key, pct]) => {
              const label = key.replace('_pct', '').replace('_', ' ').toUpperCase();
              const color = allocColors[key.replace('_pct', '')] ?? '#888';
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', minWidth: 55 }}>{label}</span>
                  <MiniBar pct={pct as number} color={color} />
                  <span style={{ fontSize: '0.58rem', color, minWidth: 22, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ fontSize: '0.58rem', color: divColor, marginTop: '0.3rem' }}>{portfolio.recommendation}</div>
      </Card>

      {/* AI Insight */}
      <div style={{ padding: '0.4rem 0.55rem', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 5 }}>
        <div style={{ fontSize: '0.55rem', color: '#a78bfa', fontWeight: 700, marginBottom: 3 }}>🤖 AI MARKET INSIGHT</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{data.ai_insight}</div>
      </div>

      {/* Stocks */}
      <Card title="Equities (Simulation)" color="#00d4ff">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
          {stocks.map(s => (
            <div key={s.symbol} style={{ padding: '0.3rem 0.4rem', background: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#00d4ff' }}>{s.symbol}</span>
                <span style={{ fontSize: '0.6rem', color: pnlColor(s.change_24h) }}>{sign(s.change_24h)}{fmt(s.change_24h, 1)}%</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>${fmt(s.price, 2)}</div>
              <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)' }}>{s.sector}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Bonds + FX side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <Card title="Bond Yields" color="#00e87a">
          {bonds.map(b => (
            <div key={b.ticker} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>{b.ticker}</span>
              <span style={{ fontSize: '0.62rem', color: '#00e87a', fontWeight: 700 }}>{fmt(b.yield_pct, 2)}%</span>
            </div>
          ))}
        </Card>
        <Card title="FX Rates" color="#a78bfa">
          {fx.map(f => (
            <div key={f.pair} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '0.57rem', color: 'var(--text-muted)' }}>{f.pair}</span>
              <span style={{ fontSize: '0.58rem', color: pnlColor(f.change_24h) }}>{sign(f.change_24h)}{fmt(f.change_24h, 2)}%</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Correlations */}
      <Card title="Asset Correlations" color="#6b7fa3">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
          {Object.entries(data.correlations ?? {}).map(([pair, corr]) => (
            <div key={pair} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.57rem', color: 'var(--text-dim)' }}>{pair.replace(/_/g, ' / ')}</span>
              <span style={{ fontSize: '0.6rem', color: Math.abs(corr as number) > 0.7 ? '#ff3366' : '#6b7fa3', fontWeight: 600 }}>{fmt(corr as number, 2)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── On-Chain Decision Timeline ─────────────────────────────────────────────────

function TimelineTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/decision-timeline`)
      .then(r => r.json())
      .then(d => { if (d?.events && d?.stats) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.events) return <ErrorMsg />;

  const events = Array.isArray(data.events) ? data.events : [];
  const { stats } = data;
  const outcomeColor = { WIN: '#00e87a', LOSS: '#ff3366', OPEN: '#f59e0b' };
  const actionColor = (a: string) => a === 'BUY' ? '#00e87a' : '#ff3366';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
        {[
          { label: 'TOTAL',    value: `${stats.total}`,            color: '#00d4ff' },
          { label: 'VERIFIED', value: `${stats.verified}`,         color: '#f7931a' },
          { label: 'WIN RATE', value: `${stats.win_rate.toFixed(1)}%`, color: '#00e87a' },
          { label: 'NET P&L',  value: `${stats.total_pnl_usd >= 0 ? '+' : ''}$${Math.abs(stats.total_pnl_usd).toFixed(0)}`, color: pnlColor(stats.total_pnl_usd) },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 5 }}>
            <div style={{ fontSize: '0.46rem', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2, marginTop: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Timeline events */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {events.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.62rem', padding: '2rem' }}>{t('fd_no_decisions')}</div>
        )}
        {events.map(ev => (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            padding: '0.45rem 0.55rem', borderRadius: 6,
            background: `${outcomeColor[ev.outcome] ?? '#888'}06`,
            border: `1px solid ${outcomeColor[ev.outcome] ?? '#888'}20`,
          }}>
            {/* Left: action badge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: '0.52rem', padding: '1px 5px', borderRadius: 3, background: `${actionColor(ev.action)}20`, border: `1px solid ${actionColor(ev.action)}40`, color: actionColor(ev.action), fontWeight: 700 }}>{ev.action}</span>
              {ev.verified && (
                <span style={{ fontSize: '0.44rem', color: '#f7931a', fontWeight: 700 }}>⛓ ON-CHAIN</span>
              )}
            </div>

            {/* Middle: details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#00d4ff' }}>{ev.symbol}</span>
                <span style={{ fontSize: '0.54rem', color: 'var(--text-dim)' }}>by {ev.agent}</span>
                <span style={{ fontSize: '0.5rem', padding: '0px 4px', borderRadius: 3, background: `${outcomeColor[ev.outcome]}18`, color: outcomeColor[ev.outcome], fontWeight: 700 }}>{ev.outcome}</span>
              </div>
              <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>
                Entry ${ev.entry_price > 999 ? ev.entry_price.toLocaleString() : ev.entry_price.toFixed(4)} → Now ${ev.current_price > 999 ? ev.current_price.toLocaleString() : ev.current_price.toFixed(4)}
                {' · '}Conf {ev.confidence?.toFixed(0)}%
              </div>
              {ev.tx_hash && ev.explorer_url && (
                <a href={ev.explorer_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.5rem', color: '#f7931a', textDecoration: 'none', marginTop: 1, display: 'inline-block' }}>
                  tx: {ev.tx_hash?.slice(0, 18)}… ↗
                </a>
              )}
            </div>

            {/* Right: P&L */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: pnlColor(ev.pnl_usd), fontFamily: 'JetBrains Mono, monospace' }}>
                {ev.pnl_usd >= 0 ? '+' : ''}${Math.abs(ev.pnl_usd).toFixed(1)}
              </div>
              <div style={{ fontSize: '0.5rem', color: pnlColor(ev.pnl_pct) }}>{ev.pnl_pct >= 0 ? '+' : ''}{ev.pnl_pct.toFixed(2)}%</div>
              <div style={{ fontSize: '0.46rem', color: 'var(--text-dim)', marginTop: 1 }}>
                {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Live Alerts Feed ───────────────────────────────────────────────────────────

function AlertsTab() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/api/alpha/alerts`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setAlerts(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <Spinner />;

  const severityColor: Record<string, string> = { critical: '#ff3366', high: '#f59e0b', medium: '#00d4ff', low: '#6b7fa3' };
  const typeIcon: Record<string, string> = { whale: '🐳', anomaly: '⚡', signal: '📡', price: '💹', risk: '⚠', info: 'ℹ' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{alerts.length} alerts · auto-refresh 15s</span>
        <span style={{ fontSize: '0.52rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a' }}>● LIVE</span>
      </div>

      {alerts.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.62rem', padding: '2.5rem 1rem' }}>
          <div style={{ marginBottom: 6 }}>{t('fd_no_alerts')}</div>
          <div style={{ fontSize: '0.54rem', color: 'var(--text-muted)' }}>Whale detector + anomaly scanner running in background</div>
        </div>
      )}

      {alerts.map((a, i) => {
        const sc = severityColor[a.severity] ?? '#6b7fa3';
        const icon = typeIcon[a.type] ?? '📌';
        return (
          <div key={i} style={{
            padding: '0.45rem 0.55rem', borderRadius: 6,
            background: `${sc}06`, border: `1px solid ${sc}25`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: '0.7rem' }}>{icon}</span>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: sc }}>{a.title}</span>
              <span style={{ fontSize: '0.46rem', padding: '0px 4px', borderRadius: 3, background: `${sc}18`, color: sc, border: `1px solid ${sc}35`, fontWeight: 700, marginLeft: 'auto', flexShrink: 0, textTransform: 'uppercase' }}>{a.severity}</span>
            </div>
            <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{a.message}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)' }}>{a.symbol}</span>
              <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)' }}>{a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── Shared UI atoms ────────────────────────────────────────────────────────────

function Spinner() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, color: '#a78bfa', fontSize: '0.7rem' }}>
      <span style={{ animation: 'pulse 1s infinite' }}>{t('wallet_loading')}</span>
    </div>
  );
}

function ErrorMsg() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, color: '#ff3366', fontSize: '0.65rem' }}>
      {t('fd_error')}
    </div>
  );
}

// ── Main FinancialDashboard ────────────────────────────────────────────────────

type TabId = 'report' | 'budget' | 'risk' | 'treasury' | 'audit' | 'multiasset' | 'timeline' | 'alerts';

interface Props { onClose: () => void }

export default function FinancialDashboard({ onClose }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('report');

  const TABS: { id: TabId; label: string; icon: string; color: string }[] = [
    { id: 'report',     label: t('fd_tab_report'),     icon: '📊', color: '#00d4ff'  },
    { id: 'budget',     label: t('fd_tab_budget'),     icon: '💰', color: '#a78bfa'  },
    { id: 'risk',       label: t('fd_tab_risk'),       icon: '⚠',  color: '#f59e0b'  },
    { id: 'treasury',   label: t('fd_tab_treasury'),   icon: '🏦', color: '#00e87a'  },
    { id: 'audit',      label: t('fd_tab_audit'),      icon: '📋', color: '#a78bfa'  },
    { id: 'multiasset', label: t('fd_tab_multiasset'), icon: '🌍', color: '#f7931a'  },
    { id: 'timeline',   label: t('fd_tab_timeline'),   icon: '⛓',  color: '#f7931a'  },
    { id: 'alerts',     label: t('fd_tab_alerts'),     icon: '🔔', color: '#ff3366'  },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const activeTabCfg = TABS.find(t => t.id === activeTab)!;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 780, maxHeight: '92vh', background: 'var(--bg-panel, #0d1117)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 0 60px rgba(167,139,250,0.15)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(167,139,250,0.04)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 10px rgba(167,139,250,0.8)', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>SOECLAW AI CFO</span>
            <span style={{ fontSize: '0.6rem', color: '#6b7fa3', padding: '1px 6px', borderRadius: 3, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>Financial Dashboard</span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: '1px solid rgba(255,51,102,0.3)', borderRadius: 5, color: '#ff3366', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>✕ ESC</button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', padding: '0.5rem 0.75rem 0', gap: 3, flexShrink: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.3rem 0.7rem', borderRadius: '5px 5px 0 0', cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', fontWeight: 600,
                background: activeTab === tab.id ? `${tab.color}12` : 'transparent',
                border: `1px solid ${activeTab === tab.id ? tab.color + '45' : 'rgba(255,255,255,0.06)'}`,
                borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid rgba(255,255,255,0.06)',
                color: activeTab === tab.id ? tab.color : '#6b7fa3',
                marginBottom: activeTab === tab.id ? -1 : 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
          <div style={{ fontSize: '0.55rem', color: activeTabCfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
            {activeTabCfg.label} — AI CFO Analysis
          </div>
          {activeTab === 'report'     && <ReportTab />}
          {activeTab === 'budget'     && <BudgetTab />}
          {activeTab === 'risk'       && <RiskTab />}
          {activeTab === 'treasury'   && <TreasuryTab />}
          {activeTab === 'audit'      && <AuditTab />}
          {activeTab === 'multiasset' && <MultiAssetTab />}
          {activeTab === 'timeline'   && <TimelineTab />}
          {activeTab === 'alerts'     && <AlertsTab />}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.45rem 1rem', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>{t('fd_powered')}</span>
          <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)' }}>{t('fd_live_data')}</span>
        </div>
      </div>
    </div>
  );
}
