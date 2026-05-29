import React, { useState, useEffect } from 'react';
import { MANTLE_NETWORK, API_URL as API_BASE } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

interface Props {
  onConnect?: (address: string, balanceMnt: number, greeting: string) => void;
  onDisconnect?: () => void;
  externalAddress?: string;
  externalBalance?: number;
}

const WalletPanel: React.FC<Props> = ({ externalAddress, externalBalance }) => {
  const { t } = useTranslation();
  const [agentWallet, setAgentWallet] = useState<{ address: string; balanceMnt: number; connected: boolean } | null>(null);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/wallet`);
        if (res.ok) {
          const data = await res.json();
          setAgentWallet({ address: data.address ?? 'N/A', balanceMnt: data.mnt_balance ?? 0, connected: data.connected ?? false });
        }
      } catch { /* backend unreachable */ }
    };
    fetchWallet();
    const iv = setInterval(fetchWallet, 30000);
    return () => clearInterval(iv);
  }, []);

  // Allow external override (CFO chat wallet connect)
  const displayAddr = externalAddress || agentWallet?.address || '';
  const displayBal  = externalAddress ? (externalBalance ?? 0) : (agentWallet?.balanceMnt ?? 0);
  const isOnline    = agentWallet?.connected ?? false;

  const shortAddr = (addr: string) =>
    addr && addr !== 'N/A' ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'N/A';

  return (
    <div className="panel mono-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.65rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="panel-title" style={{ margin: 0 }}>{t('wallet_title')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isOnline ? '#00e87a' : '#888', boxShadow: isOnline ? '0 0 5px #00e87a' : 'none' }} />
          <span className="mono-text" style={{ fontSize: '0.62rem', color: isOnline ? '#00e87a' : '#888' }}>
            {displayAddr && displayAddr !== 'N/A' ? `${displayAddr.slice(0, 5)}…${displayAddr.slice(-3)}` : '—'}
          </span>
        </div>
      </div>

      {/* Address */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('wallet_address_label')}</span>
        <span className="text-cyan" style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.03em' }} title={displayAddr}>
          {shortAddr(displayAddr)}
        </span>
      </div>

      {/* Balance + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_balance')}</div>
          <div className="text-green" style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1 }}>
            {displayBal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_network_status')}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, lineHeight: 1, color: isOnline ? 'var(--accent-green)' : '#888' }}>
            {isOnline ? t('wallet_online') : t('wallet_offline')}
          </div>
        </div>
      </div>

      {/* Network */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t('wallet_network')}</span>
        <span className="text-green" style={{ fontSize: '0.62rem', fontWeight: 600 }}>
          {MANTLE_NETWORK.displayName}
        </span>
      </div>
    </div>
  );
};

export default WalletPanel;
