import { useState, useEffect } from 'react';
import { API_URL } from '../config';

interface Signal {
  label: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  value: string;
  weight: number;
}

interface SentimentData {
  fear_greed: { score: number; label: string; color: string };
  whale: { direction: string; alert_count: number };
  social: { volume: number; trend: string };
  signals: Signal[];
  regime: string;
  ai_read: string;
  updated_at: string;
}

function GaugeArc({ score, color }: { score: number; color: string }) {
  const r = 34;
  const cx = 44, cy = 44;
  const startAngle = Math.PI;
  const endAngle = startAngle + (score / 100) * Math.PI;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const bgX2 = cx + r * Math.cos(0);
  const bgY2 = cy + r * Math.sin(0);

  return (
    <svg width={88} height={52} viewBox="0 0 88 52">
      {/* bg track */}
      <path
        d={`M ${cx + r * Math.cos(Math.PI)} ${cy + r * Math.sin(Math.PI)} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeLinecap="round"
      />
      {/* active arc — largeArc always 0: arc span ≤ 180° */}
      {score > 0 && (
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
      {/* Score centered inside arc */}
      <text
        x={cx} y={cy + 4}
        textAnchor="middle"
        style={{ fontSize: '15px', fontWeight: 900, fill: color, fontFamily: 'JetBrains Mono, monospace' }}
      >
        {score}
      </text>
    </svg>
  );
}

const SIGNAL_COLOR: Record<string, string> = {
  BULLISH: '#00e87a',
  BEARISH: '#ff3366',
  NEUTRAL: '#f59e0b',
};

const REGIME_CFG: Record<string, { label: string; color: string }> = {
  RISK_ON:  { label: 'RISK ON',  color: '#00e87a' },
  NEUTRAL:  { label: 'NEUTRAL',  color: '#f59e0b' },
  RISK_OFF: { label: 'RISK OFF', color: '#ff3366' },
};

export default function SentimentPanel() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/api/alpha/sentiment`)
        .then(r => r.json())
        .then(d => { if (d?.fear_greed && typeof d.fear_greed.score === 'number') setData(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="panel mono-text" style={{ padding: '0.65rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1s infinite' }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Loading Sentiment...</span>
      </div>
    );
  }

  if (!data) return null;

  const { fear_greed: fg, whale, social, signals, regime, ai_read } = data;
  const rc = REGIME_CFG[regime] ?? REGIME_CFG.NEUTRAL;
  const signals_safe = Array.isArray(signals) ? signals : [];

  return (
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: fg.color, boxShadow: `0 0 8px ${fg.color}`, flexShrink: 0 }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: fg.color }}>SENTIMENT INTEL</span>
        </div>
        <span style={{ fontSize: '0.54rem', padding: '1px 6px', borderRadius: 4, fontWeight: 700, background: `${rc.color}15`, border: `1px solid ${rc.color}40`, color: rc.color }}>
          {rc.label}
        </span>
      </div>

      {/* Fear & Greed Gauge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: `${fg.color}06`, border: `1px solid ${fg.color}15`, borderRadius: 7, padding: '0.4rem 0.6rem' }}>
        <div style={{ flexShrink: 0 }}>
          <GaugeArc score={fg.score} color={fg.color} />
        </div>
        <div>
          <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Fear & Greed Index</div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: fg.color, marginTop: 2, lineHeight: 1 }}>{fg.label}</div>
          <div style={{ fontSize: '0.52rem', color: '#00e87a', marginTop: 3, lineHeight: 1.4 }}>{ai_read}</div>
        </div>
      </div>

      {/* Whale + Social row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
        <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 5, padding: '0.3rem 0.4rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#00d4ff', fontWeight: 700, letterSpacing: '0.4px', marginBottom: 2 }}>🐳 WHALE SIGNAL</div>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: whale.direction === 'ACCUMULATION' ? '#00e87a' : whale.direction === 'DISTRIBUTION' ? '#ff3366' : '#f59e0b', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {whale.direction}
          </div>
          <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 2 }}>{whale.alert_count} alerts detected</div>
        </div>
        <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 5, padding: '0.3rem 0.4rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#a78bfa', fontWeight: 700, letterSpacing: '0.4px', marginBottom: 2 }}>📡 SOCIAL VOLUME</div>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {social.trend}
          </div>
          <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {social.volume >= 1000 ? `${(social.volume / 1000).toFixed(0)}K` : social.volume} mentions/hr
          </div>
        </div>
      </div>

      {/* Signals */}
      {signals_safe.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, padding: '0.3rem 0.4rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Signal Breakdown</div>
          {signals_safe.map((s, i) => {
            const c = SIGNAL_COLOR[s.type] ?? '#6b7fa3';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: '0.46rem', padding: '1px 4px', borderRadius: 3, background: `${c}20`, border: `1px solid ${c}40`, color: c, fontWeight: 700, minWidth: 42, textAlign: 'center' }}>{s.type}</span>
                <span style={{ fontSize: '0.56rem', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: c, minWidth: 36, textAlign: 'right' }}>{s.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
