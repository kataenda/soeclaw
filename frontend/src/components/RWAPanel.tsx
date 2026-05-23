import { useEffect, useState } from 'react';

interface RWAAsset {
  name: string;
  symbol: string;
  apy_pct: number;
  provider: string;
  backing: string;
  allocation_pct: number;
  projected_annual_usd: number;
  risk: string;
}

interface RWAData {
  strategy: string;
  rationale: string;
  total_virtual_usd: number;
  blended_apy: number;
  projected_annual_yield_usd: number;
  assets: RWAAsset[];
  last_updated: string;
}

const RISK_COLOR: Record<string, string> = {
  'Very Low': '#00ff88',
  'Low': '#00cc66',
  'Medium': '#ffaa00',
  'High': '#ff3366',
};

export default function RWAPanel() {
  const [data, setData] = useState<RWAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`${API}/api/rwa/yields`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Backend unreachable'); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.85rem' }}>// RWA_YIELD_OPTIMIZER</h3>
        <button className="neon-btn" onClick={load} style={{ fontSize: '0.7rem' }}>↻</button>
      </div>

      {loading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Fetching yield data...</p>}
      {error && <p style={{ color: '#ff3366', fontSize: '0.75rem' }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem', flex: 1, minWidth: '120px' }}>
              <div className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>BLENDED APY</div>
              <div className="mono-text text-cyan" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{data.blended_apy.toFixed(2)}%</div>
            </div>
            <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem', flex: 1, minWidth: '120px' }}>
              <div className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>ANNUAL YIELD</div>
              <div className="mono-text" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00ff88' }}>${data.projected_annual_yield_usd.toLocaleString()}</div>
            </div>
            <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem', flex: 1, minWidth: '120px' }}>
              <div className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>STRATEGY</div>
              <div className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffaa00' }}>{data.strategy}</div>
            </div>
          </div>

          <p className="mono-text text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.75rem', fontStyle: 'italic' }}>{data.rationale}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.assets.map(asset => (
              <div key={asset.symbol} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <div>
                    <span className="mono-text" style={{ color: '#00d4ff', fontWeight: 700, fontSize: '0.85rem' }}>{asset.symbol}</span>
                    <span className="mono-text text-muted" style={{ fontSize: '0.7rem', marginLeft: '0.5rem' }}>{asset.name}</span>
                  </div>
                  <span className="mono-text" style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 700 }}>{asset.apy_pct}% APY</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${asset.allocation_pct}%`, background: 'linear-gradient(90deg, #00d4ff, #00ff88)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                    </div>
                    <div className="mono-text text-muted" style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>{asset.allocation_pct}% allocation · {asset.provider}</div>
                  </div>
                  <div style={{ marginLeft: '0.75rem', textAlign: 'right' }}>
                    <div className="mono-text" style={{ fontSize: '0.75rem', color: RISK_COLOR[asset.risk] ?? '#888' }}>{asset.risk} risk</div>
                    <div className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>${asset.projected_annual_usd.toLocaleString()}/yr</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
