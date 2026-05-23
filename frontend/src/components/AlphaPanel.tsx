import { useEffect, useState } from 'react';

interface Alert {
  type: string;
  symbol: string;
  message: string;
  severity: string;
  timestamp: string;
  value?: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ff3366',
  high: '#ff6600',
  medium: '#ffaa00',
  low: '#00d4ff',
  info: '#888',
};

const TYPE_ICON: Record<string, string> = {
  spike: '🚀',
  crash: '📉',
  rsi_overbought: '🔴',
  rsi_oversold: '🟢',
  volatility_spike: '⚡',
  whale_transfer: '🐋',
  extreme_move: '⚠️',
};

export default function AlphaPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`${API}/api/alpha/alerts`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.alerts ?? []);
        setAlerts(list);
        setLoading(false);
      })
      .catch(() => { setError('Backend unreachable'); setLoading(false); });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const fmt = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch { return ts; }
  };

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.85rem' }}>// ALPHA_SIGNAL_FEED</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'pulse 2s infinite' }} />
          <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>LIVE · 30s</span>
          <button className="neon-btn" onClick={load} style={{ fontSize: '0.7rem' }}>↻</button>
        </div>
      </div>

      {loading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Scanning for alpha signals...</p>}
      {error && <p style={{ color: '#ff3366', fontSize: '0.75rem' }}>{error}</p>}

      {!loading && !error && alerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#555' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📡</div>
          <p className="mono-text" style={{ fontSize: '0.75rem', color: '#555' }}>No anomalies detected. Markets stable.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '280px', overflowY: 'auto' }}>
        {alerts.map((alert, i) => (
          <div
            key={i}
            style={{
              background: `rgba(${alert.severity === 'critical' ? '255,51,102' : alert.severity === 'high' ? '255,102,0' : '0,212,255'},0.06)`,
              border: `1px solid ${SEVERITY_COLOR[alert.severity] ?? '#333'}44`,
              borderLeft: `3px solid ${SEVERITY_COLOR[alert.severity] ?? '#333'}`,
              borderRadius: '4px',
              padding: '0.5rem 0.6rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem' }}>{TYPE_ICON[alert.type] ?? '🔔'}</span>
                <span className="mono-text" style={{ color: '#00d4ff', fontSize: '0.75rem', fontWeight: 700 }}>{alert.symbol}</span>
                <span
                  className="mono-text"
                  style={{
                    fontSize: '0.6rem',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: `${SEVERITY_COLOR[alert.severity] ?? '#333'}22`,
                    color: SEVERITY_COLOR[alert.severity] ?? '#888',
                    textTransform: 'uppercase',
                  }}
                >
                  {alert.severity}
                </span>
              </div>
              <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>{fmt(alert.timestamp)}</span>
            </div>
            <p className="mono-text" style={{ fontSize: '0.72rem', color: '#ccc', margin: 0 }}>{alert.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
