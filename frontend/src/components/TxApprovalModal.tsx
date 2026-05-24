import { useState } from 'react';
import { useTranslation } from '../i18n/TranslationContext';
import { MANTLE_NETWORK } from '../config';

export interface TxData {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  description: string;
  action_label?: string;
}

interface Props {
  tx: TxData;
  walletAddress: string;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
}

export default function TxApprovalModal({ tx, walletAddress, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');

  const mntValue = tx.value && tx.value !== '0x0'
    ? (parseInt(tx.value, 16) / 1e18).toFixed(4)
    : null;

  const approve = async () => {
    const eth = (window as any).ethereum;
    if (!eth) { setError('MetaMask not found'); return; }
    setSigning(true);
    setError('');
    try {
      const txHash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: tx.to,
          value: tx.value ?? '0x0',
          data: tx.data ?? '0x',
          gas: tx.gasLimit ?? '0x7530',
        }],
      });
      onSuccess(txHash);
      onClose();
    } catch (err: any) {
      setError(err.code === 4001 ? t('tx_cancel') : (err.message ?? 'Transaction failed'));
    }
    setSigning(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="panel mono-text" style={{ maxWidth: 420, width: '100%', borderColor: 'rgba(0,212,255,0.4)', boxShadow: '0 0 40px rgba(0,212,255,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: '1.4rem' }}>⚡</div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#00d4ff' }}>{t('tx_title')}</div>
            <div style={{ fontSize: '0.65rem', color: '#6b7fa3' }}>{t('tx_subtitle')}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7fa3', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>

        <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 7, padding: '0.65rem 0.8rem', marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.73rem', color: '#c0cce0', lineHeight: 1.6 }}>{tx.description}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1rem', fontSize: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7fa3' }}>{t('tx_from')}</span>
            <span style={{ color: '#c0cce0' }}>{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7fa3' }}>{t('tx_to')}</span>
            <span style={{ color: '#c0cce0' }}>{tx.to.slice(0, 8)}…{tx.to.slice(-6)}</span>
          </div>
          {mntValue && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7fa3' }}>{t('tx_value')}</span>
              <span style={{ color: '#00e87a', fontWeight: 700 }}>{mntValue} MNT</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7fa3' }}>{t('tx_network_label')}</span>
            <span style={{ color: '#f7931a' }}>{MANTLE_NETWORK.displayName}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.6rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '0.75rem' }}>⚠️</span>
          <span style={{ fontSize: '0.62rem', color: '#f59e0b' }}>{t('tx_warning')}</span>
        </div>

        {error && <p style={{ color: '#ff3366', fontSize: '0.7rem', marginBottom: '0.5rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '0.6rem', borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7fa3', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>
            {t('tx_cancel')}
          </button>
          <button onClick={approve} disabled={signing}
            style={{ flex: 2, padding: '0.6rem', borderRadius: 7, cursor: signing ? 'default' : 'pointer', background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.4)', color: '#00e87a', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, opacity: signing ? 0.6 : 1 }}>
            {signing ? t('tx_signing') : `${t('tx_approve')}${tx.action_label ? ` — ${tx.action_label}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
