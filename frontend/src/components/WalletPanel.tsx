import React, { useState } from 'react';
import { MANTLE_NETWORK } from '../config';
import { useTranslation } from '../i18n/TranslationContext';
import WalletConnect from './WalletConnect';

interface Props {
  onConnect?: (address: string, balanceMnt: number, greeting: string) => void;
  onDisconnect?: () => void;
}

const WalletPanel: React.FC<Props> = ({ onConnect, onDisconnect }) => {
  const { t } = useTranslation();
  const [userWallet, setUserWallet] = useState<{ address: string; balanceMnt: number } | null>(null);

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <>
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

      {!userWallet ? (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
          Connect wallet to view balance & run AI actions
        </div>
      ) : (
        <>
          {/* Address */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('wallet_address_label')}</span>
            <span className="text-cyan" style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.03em' }} title={userWallet.address}>
              {shortAddr(userWallet.address)}
            </span>
          </div>

          {/* Balance + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_balance')}</div>
              <div className="text-green" style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1 }}>
                {userWallet.balanceMnt.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('wallet_network_status')}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, lineHeight: 1, color: 'var(--accent-green)' }}>
                {t('wallet_online')}
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

        </>
      )}
    </div>
    </>
  );
};

export default WalletPanel;
