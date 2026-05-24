import React from 'react';
import type { Thought } from '../App';
import { useTranslation } from '../i18n/TranslationContext';

interface Props {
  thoughts: Thought[];
}

const TerminalConsole: React.FC<Props> = ({ thoughts }) => {
  const { t } = useTranslation();
  const chainCount = thoughts.filter(th => th.msg_type === 'CHAIN').length;

  return (
    <div className="panel mono-text" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.4rem', marginBottom: '0.6rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 className="text-cyan" style={{ fontSize: '0.75rem' }}>{t('terminal_title')}</h3>
        </div>
        {chainCount > 0 && (
          <span style={{ fontSize: '0.52rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.35)', color: '#f7931a', fontWeight: 700, letterSpacing: '0.5px' }}>
            ⛓ {chainCount} on-chain
          </span>
        )}
      </div>

      {/* Stream */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '0.28rem', fontSize: '0.65rem' }}>
        {thoughts.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>{t('terminal_awaiting')}</div>
        ) : (
          thoughts.map((th, i) => {
            const isChain  = th.msg_type === 'CHAIN';
            const isAction = th.msg_type === 'ACTION';
            const isData   = th.msg_type === 'DATA';
            const isNewest = i === 0;
            const isBuy    = th.message.includes('BUY') || th.message.toUpperCase().includes('→ BUY');
            const actionColor = isBuy ? 'var(--green)' : 'var(--pink)';
            const fade = i > 15 ? Math.max(0.3, 1 - (i - 15) * 0.045) : 1;

            if (isData) {
              const stepMatch = th.message.match(/^STEP (\d+)\/(\d+)/);
              const stepNum = stepMatch ? parseInt(stepMatch[1]) : 0;
              const stepTotal = stepMatch ? parseInt(stepMatch[2]) : 4;
              const stepColors = ['#00d4ff', '#a78bfa', '#f59e0b', '#00e87a'];
              const stepColor = stepColors[(stepNum - 1) % stepColors.length] ?? '#00d4ff';
              const msgBody = th.message.replace(/^STEP \d+\/\d+ · /, '');
              return (
                <div key={i} className={isNewest ? 'fade-in' : ''} style={{
                  padding: '0.28rem 0.45rem',
                  borderRadius: 4,
                  background: `${stepColor}06`,
                  border: `1px solid ${stepColor}18`,
                  opacity: isNewest ? fade : fade * 0.8,
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                    <span style={{ fontSize: '0.46rem', padding: '1px 5px', borderRadius: 3, background: `${stepColor}20`, border: `1px solid ${stepColor}40`, color: stepColor, fontWeight: 700, letterSpacing: '0.4px', flexShrink: 0 }}>
                      {stepMatch ? `STEP ${stepNum}/${stepTotal}` : 'DATA'}
                    </span>
                    <span style={{ fontSize: '0.48rem', color: stepColor, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.agent_name}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.4, fontFamily: 'JetBrains Mono, monospace' }}>
                    {msgBody}
                  </div>
                </div>
              );
            }

            if (isChain) {
              return (
                <div key={i} className={isNewest ? 'fade-in' : ''} style={{
                  padding: '0.35rem 0.5rem',
                  borderRadius: '5px',
                  background: 'rgba(247,147,26,0.07)',
                  border: `1px solid rgba(247,147,26,${isNewest ? '0.45' : '0.2'})`,
                  boxShadow: isNewest ? '0 0 12px rgba(247,147,26,0.15)' : 'none',
                  flexShrink: 0,
                  opacity: fade,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.18rem' }}>
                    <span style={{ fontSize: '0.5rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(247,147,26,0.2)', border: '1px solid rgba(247,147,26,0.45)', color: '#f7931a', fontWeight: 700, letterSpacing: '0.5px' }}>⛓ MANTLE</span>
                    {isNewest && (
                      <span style={{ fontSize: '0.48rem', color: '#f7931a', animation: 'pulse 1.5s infinite', fontWeight: 600 }}>● CONFIRMED</span>
                    )}
                  </div>
                  <div style={{ color: '#f7931a', fontSize: '0.62rem', lineHeight: 1.4 }}>{th.message}</div>
                  {th.tx_hash && (
                    <div style={{ marginTop: '0.2rem', fontSize: '0.52rem', color: 'rgba(247,147,26,0.5)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span>tx: {th.tx_hash.slice(0, 20)}…</span>
                      {th.explorer_url && (
                        <a href={th.explorer_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#f7931a', textDecoration: 'underline', fontWeight: 700, fontSize: '0.54rem' }}>
                          verify ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            const borderColor = isAction ? actionColor : 'var(--accent-cyan)';
            return (
              <div key={i} className={isNewest ? 'fade-in' : ''} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.35rem',
                borderLeft: `2px solid ${borderColor}`,
                paddingLeft: '0.4rem',
                opacity: fade,
                flexShrink: 0,
              }}>
                {isAction && (
                  <span style={{
                    fontSize: '0.48rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 700,
                    background: isBuy ? 'rgba(0,232,122,0.15)' : 'rgba(255,51,102,0.15)',
                    color: actionColor,
                    marginTop: '2px', flexShrink: 0, letterSpacing: '0.5px',
                  }}>
                    {isBuy ? '▲ BUY' : '▼ SELL'}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: th.agent_name === 'MANTLE' ? '#f7931a' : borderColor, fontWeight: 700, fontSize: '0.58rem' }}>
                    [{th.agent_name}]
                  </span>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>&gt;</span>{' '}
                  <span style={{ color: isAction ? actionColor : 'var(--text)', fontSize: '0.62rem' }}>{th.message}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TerminalConsole;
