import React from 'react';
import type { Trade, Prices } from '../App';
import { useTranslation } from '../i18n/TranslationContext';

interface Props {
  trades: Trade[];
  prices: Prices;
  newTxHash?: string | null;
}

const calcPnl = (trade: Trade, prices: Prices): number | null => {
  const info = prices[trade.symbol];
  if (!info || info.price === 0 || trade.price === 0) return null;
  const diff = info.price - trade.price;
  const pct  = (diff / trade.price) * 100;
  return trade.action === 'SELL' ? -pct : pct;
};

const ActivePositions: React.FC<Props> = ({ trades, prices, newTxHash }) => {
  const { t } = useTranslation();

  return (
    <div className="panel mono-text" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <h3 className="text-cyan" style={{ fontSize: '0.85rem', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
        {t('positions_title')}
      </h3>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,255,204,0.1)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_time')}</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_asset')}</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_action')}</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_entry')}</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_current')}</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>{t('col_hash')}</th>
              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t('col_pnl')}</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t('positions_empty')}
                </td>
              </tr>
            ) : (
              trades.map((tr, idx) => {
                const pnl = calcPnl(tr, prices);
                const pnlColor = pnl === null ? 'var(--text-muted)' : pnl >= 0 ? 'var(--accent-green)' : '#ff3366';
                const currentInfo = prices[tr.symbol];
                const currentPriceStr = currentInfo && currentInfo.price > 0
                  ? `$${currentInfo.price >= 1000
                      ? currentInfo.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : currentInfo.price.toFixed(4)}`
                  : '—';

                return (
                  <tr key={idx} className={tr.tx_hash === newTxHash ? 'row-flash' : ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {tr.created_at
                        ? new Date(tr.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', fontWeight: 'bold' }}>{tr.symbol}</td>
                    <td style={{ padding: '0.3rem 0.5rem' }}>
                      <span className={tr.action === 'BUY' ? 'text-green' : 'text-pink'} style={{ fontWeight: 'bold' }}>
                        {tr.action}
                      </span>
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem' }}>
                      ${tr.price >= 1000
                        ? tr.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : tr.price.toFixed(4)}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--accent-cyan)' }}>
                      {currentPriceStr}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem' }}>
                      {tr.tx_hash ? (
                        <a
                          href={`https://explorer.mantle.xyz/tx/${tr.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan"
                          style={{ textDecoration: 'none' }}
                        >
                          {tr.tx_hash.slice(0, 6)}...{tr.tx_hash.slice(-4)}
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: pnlColor, fontWeight: 'bold' }}>
                      {pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivePositions;
