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

  const fetchWallet = async () => {
    try {
      const res = await fetch(`${API_URL}/api/wallet`);
      if (res.ok) setWallet(await res.json());
    } catch {
      // backend not reachable yet
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
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 className="text-cyan" style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.5rem' }}>
        {t('wallet_title')}
      </h3>

      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('wallet_address_label')}</div>
        {loading ? (
          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{t('wallet_loading')}</div>
        ) : (
          <div
            className="text-cyan"
            style={{ fontSize: '0.85rem', wordBreak: 'break-all', marginTop: '0.25rem' }}
            title={wallet?.address}
          >
            {wallet ? shortAddr(wallet.address) : 'N/A'}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('wallet_balance')}</div>
          <div className="text-green" style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '0.25rem' }}>
            {loading ? '...' : wallet ? wallet.mnt_balance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('wallet_network_status')}</div>
          <div
            style={{ fontSize: '0.85rem', fontWeight: 'bold', marginTop: '0.25rem', color: wallet?.connected ? 'var(--accent-green)' : '#ff3366' }}
          >
            {loading ? '...' : wallet?.connected ? t('wallet_online') : t('wallet_offline')}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('wallet_network')}</div>
        <div className="text-green" style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>
          {wallet?.network ?? 'Mantle Sepolia Testnet'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <a
          href="https://faucet.sepolia.mantle.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="neon-btn"
          style={{ flex: 1, fontSize: '0.75rem', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {t('wallet_faucet')}
        </a>
        <button className="neon-btn" style={{ flex: 1, fontSize: '0.75rem' }} onClick={fetchWallet}>
          {t('wallet_refresh')}
        </button>
      </div>
    </div>
  );
};

export default WalletPanel;
