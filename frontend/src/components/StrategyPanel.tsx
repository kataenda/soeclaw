import React, { useState } from 'react';
import { useTranslation } from '../i18n/TranslationContext';
import type { Dict } from '../i18n/translations';

interface Strategy {
  agent: string;
  specialtyKey: keyof Dict;
  strategyKey: keyof Dict;
  indicatorKeys: [keyof Dict, keyof Dict, keyof Dict];
  signals: { condKey: keyof Dict; actKey: keyof Dict }[];
  color: string;
}

const STRATEGIES: Strategy[] = [
  {
    agent: 'AlphaQuant',
    specialtyKey: 'alphaquant_specialty',
    strategyKey: 'alphaquant_strategy',
    indicatorKeys: ['aq_ind1', 'aq_ind2', 'aq_ind3'],
    signals: [
      { condKey: 'aq_sig1_cond', actKey: 'aq_sig1_act' },
      { condKey: 'aq_sig2_cond', actKey: 'aq_sig2_act' },
      { condKey: 'aq_sig3_cond', actKey: 'aq_sig3_act' },
    ],
    color: 'var(--accent-cyan)',
  },
  {
    agent: 'WhaleWatcher',
    specialtyKey: 'whalewatcher_specialty',
    strategyKey: 'whalewatcher_strategy',
    indicatorKeys: ['ww_ind1', 'ww_ind2', 'ww_ind3'],
    signals: [
      { condKey: 'ww_sig1_cond', actKey: 'ww_sig1_act' },
      { condKey: 'ww_sig2_cond', actKey: 'ww_sig2_act' },
      { condKey: 'ww_sig3_cond', actKey: 'ww_sig3_act' },
    ],
    color: '#a78bfa',
  },
  {
    agent: 'MacroAnalyzer',
    specialtyKey: 'macroanalyzer_specialty',
    strategyKey: 'macroanalyzer_strategy',
    indicatorKeys: ['ma_ind1', 'ma_ind2', 'ma_ind3'],
    signals: [
      { condKey: 'ma_sig1_cond', actKey: 'ma_sig1_act' },
      { condKey: 'ma_sig2_cond', actKey: 'ma_sig2_act' },
      { condKey: 'ma_sig3_cond', actKey: 'ma_sig3_act' },
    ],
    color: 'var(--accent-green)',
  },
  {
    agent: 'RiskManager',
    specialtyKey: 'riskmanager_specialty',
    strategyKey: 'riskmanager_strategy',
    indicatorKeys: ['rm_ind1', 'rm_ind2', 'rm_ind3'],
    signals: [
      { condKey: 'rm_sig1_cond', actKey: 'rm_sig1_act' },
      { condKey: 'rm_sig2_cond', actKey: 'rm_sig2_act' },
      { condKey: 'rm_sig3_cond', actKey: 'rm_sig3_act' },
    ],
    color: '#fb923c',
  },
];

const StrategyPanel: React.FC = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>(STRATEGIES[0].agent);
  const current = STRATEGIES.find(s => s.agent === active)!;

  return (
    <div className="panel mono-text" style={{ flex: '0 0 34%', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0, overflow: 'hidden' }}>
      <h3 className="text-cyan" style={{ fontSize: '0.85rem', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.4rem' }}>
        {t('strategy_title')}
      </h3>

      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {STRATEGIES.map(s => (
          <button
            key={s.agent}
            onClick={() => setActive(s.agent)}
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.62rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: '4px',
              border: `1px solid ${active === s.agent ? s.color : 'rgba(0,255,204,0.15)'}`,
              background: active === s.agent ? `${s.color}22` : 'transparent',
              color: active === s.agent ? s.color : 'var(--text-muted)',
              letterSpacing: '0.5px',
            }}
          >
            {s.agent}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.72rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div>
          <span style={{ color: current.color, fontWeight: 'bold' }}>{current.agent}</span>
          <span className="text-muted" style={{ marginLeft: '0.4rem' }}>— {t(current.specialtyKey)}</span>
        </div>

        <p style={{ color: 'var(--text-main)', lineHeight: '1.5', margin: 0 }}>
          {t(current.strategyKey)}
        </p>

        <div>
          <div className="text-muted" style={{ fontSize: '0.62rem', letterSpacing: '1px', marginBottom: '0.3rem' }}>{t('strategy_indicators')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {current.indicatorKeys.map((key, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: current.color }}>▸</span>
                <span style={{ color: 'var(--text-main)' }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-muted" style={{ fontSize: '0.62rem', letterSpacing: '1px', marginBottom: '0.3rem' }}>{t('strategy_signals')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {current.signals.map((sig, i) => (
              <div key={i} style={{ padding: '0.3rem 0.5rem', border: `1px solid ${current.color}33`, borderRadius: '4px', background: `${current.color}08` }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>IF: {t(sig.condKey)}</div>
                <div style={{ color: current.color, fontSize: '0.65rem', marginTop: '0.1rem' }}>→ {t(sig.actKey)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyPanel;
