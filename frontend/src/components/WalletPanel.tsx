import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

interface WalletData {
  address: string;
  mnt_balance: number;
  network: string;
  chain_id: number;
  connected: boolean;
}

const WalletPanel: React.FC = () => {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  const shortAddr = (addr: string) =>
    addr !== 'N/A' ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'N/A';

  return (
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h3 className="panel-title">{t('wallet_title')}</h3>

      {error && (
        <div style={{ fontSize: '0.68rem', color: '#ff3366', padding: '0.25rem 0.5rem', border: '1px solid rgba(255,51,102,0.3)', borderRadius: '4px', background: 'rgba(255,51,102,0.06)' }}>
          Backend unreachable —{' '}
          <button onClick={fetchWallet} style={{ background: 'none', border: 'none', color: '#ff3366', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}>retry</button>
        </div>
      )}

      {/* Address */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('wallet_address_label')}</span>
        <span className="text-cyan" style={{ fontSize: '0.8rem', fontFamily: 'monospace', letterSpacing: '0.03em' }} title={wallet?.address}>
          {loading ? '…' : (wallet ? shortAddr(wallet.address) : 'N/A')}
        </span>
      </div>

      {/* Balance + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_balance')}</div>
          <div className="text-green" style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>
            {loading ? '...' : (wallet?.mnt_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_network_status')}</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1, color: wallet?.connected ? 'var(--accent-green)' : '#ff3366' }}>
            {loading ? '...' : wallet?.connected ? t('wallet_online') : t('wallet_offline')}
          </div>
        </div>
      </div>

      {/* Network */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t('wallet_network')}</span>
        <span className="text-green" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
          {wallet?.network ?? 'Mantle Sepolia Testnet'}
        </span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <a href="https://faucet.sepolia.mantle.xyz" target="_blank" rel="noopener noreferrer" className="neon-btn"
          style={{ flex: 1, fontSize: '0.7rem', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('wallet_faucet')}
        </a>
        <button className="neon-btn" style={{ flex: 1, fontSize: '0.7rem' }} onClick={fetchWallet}>
          {t('wallet_refresh')}
        </button>
      </div>
    </div>
  );
};

export default WalletPanel;
