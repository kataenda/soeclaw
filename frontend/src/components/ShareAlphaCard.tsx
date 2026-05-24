import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

interface AlphaData {
  alpha_pct: number;
  ai_return_pct: number;
  btc_baseline_pct: number;
  total_pnl_usd: number;
  win_rate: number;
  sharpe_ratio: number;
  verified_onchain: number;
  total_decisions: number;
  verdict: string;
}

const VERDICT_LABEL: Record<string, string> = {
  BEATING_MARKET:   'BEATING THE MARKET',
  NEUTRAL:          'NEUTRAL',
  UNDERPERFORMING:  'UNDERPERFORMING',
  INSUFFICIENT_DATA:'NO DATA YET',
};

interface Props {
  onClose: () => void;
}

export default function ShareAlphaCard({ onClose }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<AlphaData | null>(null);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/alpha-scorecard`)
      .then(r => r.json())
      .then(d => { if (d && typeof d.alpha_pct === 'number') setData(d); })
      .catch(() => {});
  }, []);

  const handleCopyText = () => {
    if (!data) return;
    const sign = (n: number) => n >= 0 ? '+' : '';
    const text = [
      `🤖 SOECLAW AI CFO — ALPHA REPORT`,
      ``,
      `Alpha vs BTC: ${sign(data.alpha_pct)}${data.alpha_pct.toFixed(2)}%`,
      `AI Portfolio:  ${sign(data.ai_return_pct)}${data.ai_return_pct.toFixed(2)}%`,
      `BTC Baseline:  ${sign(data.btc_baseline_pct)}${data.btc_baseline_pct.toFixed(2)}%`,
      ``,
      `Win Rate:   ${data.win_rate.toFixed(1)}%`,
      `Sharpe:     ${data.sharpe_ratio.toFixed(2)}`,
      `Decisions:  ${data.total_decisions}`,
      `On-chain:   ${data.verified_onchain} ERC-8004 proofs`,
      ``,
      `Verdict: ${VERDICT_LABEL[data.verdict] ?? data.verdict}`,
      ``,
      `Verifiable on Mantle Sepolia L2 · ERC-8004`,
      `sepolia.mantlescan.xyz`,
      ``,
      `#MantleAIHackathon #MantleTuringTest #SoeClaw`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const sign = (n: number) => n >= 0 ? '+' : '';
  const alphaColor = data ? (data.alpha_pct > 0 ? '#00e87a' : data.alpha_pct < -1 ? '#ff3366' : '#f59e0b') : '#f59e0b';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 460, width: '100%', padding: '0 1rem' }}>

        {/* The shareable card */}
        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1220 50%, #080c18 100%)',
          border: `2px solid ${alphaColor}40`,
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: `0 0 40px ${alphaColor}20, 0 20px 60px rgba(0,0,0,0.8)`,
          fontFamily: 'JetBrains Mono, monospace',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background glow blobs */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: '50%', background: `${alphaColor}08`, filter: 'blur(40px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(167,139,250,0.06)', filter: 'blur(35px)', pointerEvents: 'none' }} />

          {/* Brand header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,232,122,0.15))', border: '1px solid rgba(0,212,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🤖</div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#00d4ff', letterSpacing: '-0.3px' }}>SOECLAW <span style={{ color: '#a78bfa' }}>AI CFO</span></div>
                <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px', textTransform: 'uppercase' }}>Mantle L2 · ERC-8004</div>
              </div>
            </div>
            {data && (
              <span style={{ fontSize: '0.52rem', padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: `${alphaColor}18`, border: `1px solid ${alphaColor}50`, color: alphaColor }}>
                {VERDICT_LABEL[data.verdict] ?? data.verdict}
              </span>
            )}
          </div>

          {/* Hero alpha number */}
          {data ? (
            <>
              <div style={{ textAlign: 'center', padding: '1rem 0.5rem', background: `${alphaColor}08`, border: `1px solid ${alphaColor}20`, borderRadius: 10, marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Alpha Generated vs BTC</div>
                <div style={{ fontSize: '3rem', fontWeight: 900, color: alphaColor, lineHeight: 1, letterSpacing: '-2px', textShadow: `0 0 30px ${alphaColor}60` }}>
                  {sign(data.alpha_pct)}{data.alpha_pct.toFixed(2)}%
                </div>
                <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                  {data.verified_onchain} decisions verified on-chain
                </div>
              </div>

              {/* AI vs BTC */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                  <div style={{ fontSize: '0.48rem', color: '#00e87a', letterSpacing: '0.5px', marginBottom: 3 }}>🤖 AI PORTFOLIO</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00e87a', lineHeight: 1 }}>{sign(data.ai_return_pct)}{data.ai_return_pct.toFixed(2)}%</div>
                  <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>${Math.abs(data.total_pnl_usd).toFixed(0)} net P&L</div>
                </div>
                <div style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.2)', borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                  <div style={{ fontSize: '0.48rem', color: '#f7931a', letterSpacing: '0.5px', marginBottom: 3 }}>₿ BTC BASELINE</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f7931a', lineHeight: 1 }}>{sign(data.btc_baseline_pct)}{data.btc_baseline_pct.toFixed(2)}%</div>
                  <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>24h buy & hold</div>
                </div>
              </div>

              {/* KPIs row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '1rem' }}>
                {[
                  { label: 'WIN RATE',  value: `${data.win_rate.toFixed(1)}%`,  color: '#00d4ff' },
                  { label: 'SHARPE',    value: data.sharpe_ratio.toFixed(2),    color: '#a78bfa' },
                  { label: 'DECISIONS', value: `${data.total_decisions}`,        color: '#6b7fa3' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>{t('share_loading')}</div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.6rem' }}>
            <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.5px' }}>
              sepolia.mantlescan.xyz
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['#MantleAIHackathon', '#ERC8004'].map(tag => (
                <span key={tag} style={{ fontSize: '0.44rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)', color: 'rgba(167,139,250,0.7)' }}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleCopyText}
            style={{
              flex: 1, padding: '0.6rem', borderRadius: 8, border: '1px solid rgba(0,232,122,0.4)',
              background: 'rgba(0,232,122,0.08)', color: '#00e87a', fontSize: '0.65rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,232,122,0.16)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,232,122,0.08)'; }}
          >
            {copied ? '✓ COPIED!' : t('share_copy')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem',
              cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {t('share_close')}
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.52rem', color: 'rgba(255,255,255,0.2)' }}>
          {t('share_hint')}
        </div>
      </div>
    </div>
  );
}
