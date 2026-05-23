import React from 'react';
import type { Thought } from '../App';
import { useTranslation } from '../i18n/TranslationContext';

interface Props {
  thoughts: Thought[];
}

const agentColor = (name: string) => {
  if (name === 'MANTLE') return '#f7931a';
  return undefined;
};

const TerminalConsole: React.FC<Props> = ({ thoughts }) => {
  const { t } = useTranslation();

  return (
    <div className="panel mono-text" style={{ flex: '0 0 44%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <h3 className="text-cyan" style={{ fontSize: '0.85rem', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
        {t('terminal_title')}
      </h3>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '0.5rem', fontSize: '0.75rem' }}>
        {thoughts.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('terminal_awaiting')}</div>
        ) : (
          thoughts.map((th, i) => {
            const isChain = th.msg_type === 'CHAIN';
            const color = isChain
              ? '#f7931a'
              : th.msg_type === 'ACTION'
              ? 'var(--accent-green)'
              : 'var(--accent-cyan)';

            return (
              <div
                key={i}
                style={{ borderLeft: `2px solid ${color}`, paddingLeft: '0.5rem' }}
              >
                <span style={{ color: agentColor(th.agent_name) ?? color }}>
                  [{th.agent_name}]
                </span>{' '}
                <span style={{ color: 'var(--text-muted)' }}>&gt;</span>{' '}
                <span>{th.message}</span>
                {isChain && th.tx_hash && (
                  <div style={{ marginTop: '0.2rem', paddingLeft: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>tx: </span>
                    <span style={{ color: '#aaa' }}>{th.tx_hash.slice(0, 18)}…</span>
                    {th.explorer_url && (
                      <>
                        {' '}
                        <a
                          href={th.explorer_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#f7931a', textDecoration: 'underline', fontSize: '0.7rem' }}
                        >
                          [View on Mantle Explorer]
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TerminalConsole;
