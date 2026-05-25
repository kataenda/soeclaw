import { useState } from 'react';
import { API_URL } from '../config';

export interface SwapData {
  from_token: string;
  to_token: string;
  amount: number;
  out_amount: string;
  route?: string;
  agent: string;
  symbol: string;
  action: string;
  confidence: number;
}

interface Props {
  swap: SwapData;
  onClose: () => void;
  onSuccess: (result: string) => void;
}

export default function SwapApprovalModal({ swap, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const execute = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/byreal/swap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_token: swap.from_token,
          to_token: swap.to_token,
          amount: swap.amount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const txId = data.data?.tx_hash ?? data.data?.signature ?? data.data?.txHash ?? 'executed';
        onSuccess(txId);
        onClose();
      } else {
        setError(data.error ?? 'Swap execution failed');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  const isBuy = swap.action === 'BUY';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="panel mono-text" style={{ maxWidth: 400, width: '100%', borderColor: 'rgba(247,147,26,0.4)', boxShadow: '0 0 40px rgba(247,147,26,0.12)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: '1.3rem' }}>⚡</div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f7931a' }}>Byreal Agent Swap</div>
            <div style={{ fontSize: '0.6rem', color: '#6b7fa3' }}>Agent execution via Byreal CLMM DEX · Solana</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7fa3', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.58rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', fontWeight: 700 }}>{swap.agent}</span>
          <span style={{ fontSize: '0.58rem', padding: '2px 6px', borderRadius: 4, background: isBuy ? 'rgba(0,232,122,0.1)' : 'rgba(255,51,102,0.1)', border: `1px solid ${isBuy ? 'rgba(0,232,122,0.3)' : 'rgba(255,51,102,0.3)'}`, color: isBuy ? '#00e87a' : '#ff3366', fontWeight: 700 }}>{swap.action}</span>
          <span style={{ fontSize: '0.58rem', color: '#6b7fa3' }}>{swap.symbol} · Conf {swap.confidence}%</span>
        </div>

        <div style={{ background: 'rgba(247,147,26,0.05)', border: '1px solid rgba(247,147,26,0.15)', borderRadius: 7, padding: '0.7rem', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>From</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e0e6f0' }}>{swap.amount} {swap.from_token}</div>
            </div>
            <div style={{ fontSize: '1.1rem', color: '#f7931a', padding: '0 12px' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>To</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#00e87a' }}>{swap.out_amount} {swap.to_token}</div>
            </div>
          </div>
          {swap.route && (
            <div style={{ fontSize: '0.53rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 6 }}>Route: {swap.route}</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: '0.85rem', fontSize: '0.67rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7fa3' }}>Network</span>
            <span style={{ color: '#f7931a' }}>Solana · Byreal CLMM</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7fa3' }}>Slippage</span>
            <span style={{ color: '#c0cce0' }}>0.5%</span>
          </div>
        </div>

        <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>⚠ Requires Byreal wallet configured in Railway. Real swap on Solana.</span>
        </div>

        {error && <p style={{ color: '#ff3366', fontSize: '0.67rem', marginBottom: '0.5rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.6rem', borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7fa3', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>
            Skip
          </button>
          <button onClick={execute} disabled={loading} style={{ flex: 2, padding: '0.6rem', borderRadius: 7, cursor: loading ? 'default' : 'pointer', background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.4)', color: '#f7931a', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Executing…' : '⚡ Execute Swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
