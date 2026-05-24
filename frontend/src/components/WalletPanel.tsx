import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';
import WalletConnect from './WalletConnect';
import TxApprovalModal from './TxApprovalModal';
import type { TxData } from './TxApprovalModal';

interface WalletData {
  address: string;
  mnt_balance: number;
  network: string;
  chain_id: number;
  connected: boolean;
}

interface Props {
  onConnect?: (address: string, balanceMnt: number, greeting: string) => void;
  onDisconnect?: () => void;
}

const WalletPanel: React.FC<Props> = ({ onConnect, onDisconnect }) => {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [userWallet, setUserWallet] = useState<{ address: string; balanceMnt: number } | null>(null);
  const [pendingTx, setPendingTx] = useState<TxData | null>(null);
  const [aiPreview, setAiPreview] = useState<{ symbol: string; action: string; confidence: number; reasoning: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [oracleStatus, setOracleStatus] = useState<string | null>(null);

  const fetchWallet = async () => {
    setError(false);
    try {
      const res = await fetch(`${API_URL}/api/wallet`);
      if (res.ok) {
        setWallet(await res.json());
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
    const interval = setInterval(fetchWallet, 30000);
    return () => clearInterval(interval);
  }, []);

  const pollOracleResult = (requestId: number) => {
    setOracleStatus('⏳ Oracle listening for AI result on-chain…');
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${API_URL}/api/ai/result/${requestId}`);
        const data = await res.json();
        if (data.fulfilled) {
          clearInterval(interval);
          setOracleStatus(null);
          setActionSuccess(`✅ AI result on-chain! ${data.action} (${data.confidence}%) — ${data.reasoning.slice(0, 60)}…`);
          setTimeout(() => setActionSuccess(null), 10000);
        } else if (attempts >= 30) {
          clearInterval(interval);
          setOracleStatus(null);
          setActionSuccess('⚠️ Oracle timeout — check dashboard for result');
          setTimeout(() => setActionSuccess(null), 5000);
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const runAIAction = async () => {
    if (!userWallet || loadingAction) return;
    setLoadingAction(true);
    setActionSuccess(null);
    setOracleStatus(null);
    try {
      const res = await fetch(`${API_URL}/api/ai/run-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: userWallet.address }),
      });
      const data = await res.json();
      setAiPreview(data.preview);
      setPendingTx(data.tx_data);
    } catch {
      setActionSuccess('❌ Backend unreachable');
    }
    setLoadingAction(false);
  };

  const shortAddr = (addr: string) =>
    addr !== 'N/A' ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'N/A';

  return (
    <>
    {pendingTx && userWallet && (
      <TxApprovalModal
        tx={pendingTx}
        walletAddress={userWallet.address}
        onClose={() => { setPendingTx(null); setAiPreview(null); }}
        onSuccess={(hash) => {
          setPendingTx(null);
          setActionSuccess(`✅ requestAI() sent! ${hash.slice(0, 10)}… — oracle processing…`);
          // Extract requestId from tx receipt is hard client-side; poll by counting
          // The oracle will fulfill within ~10s, poll starting from id 0 up
          fetch(`${API_URL}/api/ai/result/0`).then(r => r.json()).then(d => {
            // find latest unfulfilled by checking requestCount via polling
            pollOracleResult(0);
          }).catch(() => {});
        }}
      />
    )}
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.65rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="panel-title" style={{ margin: 0 }}>{t('wallet_title')}</h3>
        {!userWallet ? (
          <WalletConnect
            onConnect={(address, balanceMnt, greeting) => {
              setUserWallet({ address, balanceMnt });
              onConnect?.(address, balanceMnt, greeting);
            }}
            onDisconnect={() => {
              setUserWallet(null);
              onDisconnect?.();
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e87a', boxShadow: '0 0 5px #00e87a' }} />
            <span className="mono-text" style={{ fontSize: '0.62rem', color: '#00e87a' }}>
              {userWallet.address.slice(0, 5)}…{userWallet.address.slice(-3)}
            </span>
            <button
              onClick={() => { setUserWallet(null); onDisconnect?.(); }}
              title="Disconnect wallet"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,51,102,0.45)', fontSize: '0.65rem', padding: '0 1px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ff3366')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,51,102,0.45)')}
            >✕</button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '0.68rem', color: '#ff3366', padding: '0.25rem 0.5rem', border: '1px solid rgba(255,51,102,0.3)', borderRadius: '4px', background: 'rgba(255,51,102,0.06)' }}>
          Backend unreachable —{' '}
          <button onClick={fetchWallet} style={{ background: 'none', border: 'none', color: '#ff3366', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}>retry</button>
        </div>
      )}

      {/* Address */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('wallet_address_label')}</span>
        <span className="text-cyan" style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.03em' }} title={wallet?.address}>
          {loading ? '…' : (wallet ? shortAddr(wallet.address) : 'N/A')}
        </span>
      </div>

      {/* Balance + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_balance')}</div>
          <div className="text-green" style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1 }}>
            {loading ? '...' : (wallet?.mnt_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_network_status')}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, lineHeight: 1, color: wallet?.connected ? 'var(--accent-green)' : '#ff3366' }}>
            {loading ? '...' : wallet?.connected ? t('wallet_online') : t('wallet_offline')}
          </div>
        </div>
      </div>

      {/* Network */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t('wallet_network')}</span>
        <span className="text-green" style={{ fontSize: '0.62rem', fontWeight: 600 }}>
          {loading ? '…' : (wallet?.network ?? 'N/A')}
        </span>
      </div>

      {/* Run AI Action — only when user wallet is connected */}
      {userWallet && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <button
            onClick={runAIAction}
            disabled={loadingAction}
            className="neon-btn"
            style={{
              width: '100%', fontSize: '0.65rem', fontWeight: 700, padding: '0.35rem 0.5rem',
              borderColor: loadingAction ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.55)',
              color: loadingAction ? 'rgba(167,139,250,0.4)' : '#a78bfa',
              background: loadingAction ? 'transparent' : 'rgba(167,139,250,0.07)',
              cursor: loadingAction ? 'default' : 'pointer',
            }}
          >
            {loadingAction ? '⏳ AI thinking…' : '⚡ Run AI Action'}
          </button>
          {aiPreview && !pendingTx && (
            <div style={{ fontSize: '0.58rem', color: '#a78bfa', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, padding: '0.3rem 0.45rem', lineHeight: 1.5 }}>
              <div style={{ fontSize: '0.55rem', color: '#6b7fa3', marginBottom: 2 }}>AI preview (will be written on-chain after sign)</div>
              {aiPreview.action} <span style={{ color: '#00d4ff' }}>{aiPreview.symbol}</span> — {aiPreview.confidence}%
            </div>
          )}
          {oracleStatus && (
            <div style={{ fontSize: '0.58rem', color: '#f59e0b', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '0.25rem 0.45rem' }}>
              {oracleStatus}
            </div>
          )}
          {actionSuccess && (
            <div style={{ fontSize: '0.58rem', color: '#00e87a', background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 4, padding: '0.25rem 0.45rem', lineHeight: 1.5 }}>
              {actionSuccess}
            </div>
          )}
        </div>
      )}

    </div>
    </>
  );
};

export default WalletPanel;
