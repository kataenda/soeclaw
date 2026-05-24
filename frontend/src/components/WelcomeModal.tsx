import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/TranslationContext';

const FEATURES = [
  { icon: '🤖', key: 'feat1', color: '#00d4ff' },
  { icon: '💼', key: 'feat2', color: '#a78bfa' },
  { icon: '🏦', key: 'feat3', color: '#00e87a' },
  { icon: '⛓', key: 'feat4', color: '#f7931a' },
];

const GLOSSARY_TERMS = ['MNT', 'ROI', 'RWA', 'On-Chain', 'AI Agent'];

const FEAT_EN: Record<string, { title: string; desc: string }> = {
  feat1: { title: '4 AI Trading Agents', desc: 'Trade 24/7 on Mantle L2 — no manual input needed' },
  feat2: { title: 'AI Personal CFO',     desc: 'Personalized portfolio strategy based on your risk & goals' },
  feat3: { title: 'RWA Yield Optimizer', desc: 'Real-world asset yields up to 12% APY, auto-rebalanced' },
  feat4: { title: 'On-Chain Verified',   desc: 'Every AI decision recorded on Mantle — fully transparent' },
};

const GLOSS_EN: Record<string, string> = {
  MNT:        'Mantle token — the native currency on this blockchain',
  ROI:        'Return on Investment — profit % the agent generated',
  RWA:        'Real-World Assets — T-bills & bonds tokenized on-chain',
  'On-Chain': 'Data permanently recorded on blockchain — anyone can verify',
  'AI Agent': 'Autonomous program that makes trading decisions 24/7',
};

export default function WelcomeModal() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState(0);

  useEffect(() => {
    if (!localStorage.getItem('soeclaw_welcomed')) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem('soeclaw_welcomed', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(5,5,8,0.94)',
      backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        maxWidth: 460, width: '100%',
        background: 'rgba(10,10,20,0.99)',
        border: '1px solid rgba(0,212,255,0.22)',
        borderRadius: 16,
        padding: '2rem 1.75rem',
        boxShadow: '0 32px 80px rgba(0,0,0,0.85), 0 0 60px rgba(0,212,255,0.07)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #00d4ff 40%, #a78bfa 60%, transparent)' }} />

        {step === 0 && (
          <div className="fade-in">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-1px', lineHeight: 1, marginBottom: 8 }}>
                <span style={{ color: '#00d4ff' }}>SOE</span><span style={{ color: '#a78bfa' }}>CLAW</span>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#6b7fa3', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '3px', textTransform: 'uppercase' }}>
                AI Trading CFO · Mantle L2
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#dde6f0', lineHeight: 1.65, marginBottom: 6 }}>
                Your <span style={{ color: '#a78bfa', fontWeight: 700 }}>AI-powered CFO</span> that trades, optimizes yields, and manages your DeFi portfolio — <span style={{ color: '#00e87a', fontWeight: 600 }}>automatically</span>.
              </p>
              <p style={{ fontSize: '0.68rem', color: '#6b7fa3', lineHeight: 1.5 }}>
                {t('wm_new_crypto') === 'New to crypto?' ? 'No crypto experience needed. Set your goals, AI does the rest.' : 'Tidak perlu pengalaman crypto. Tentukan tujuan, AI yang bekerja.'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {FEATURES.map(f => (
                <div key={f.key} style={{ padding: '0.7rem 0.75rem', background: `${f.color}09`, border: `1px solid ${f.color}22`, borderRadius: 10 }}>
                  <div style={{ fontSize: '1.2rem', marginBottom: 5 }}>{f.icon}</div>
                  <div style={{ fontSize: '0.67rem', fontWeight: 700, color: f.color, fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>{FEAT_EN[f.key].title}</div>
                  <div style={{ fontSize: '0.6rem', color: '#6b7fa3', lineHeight: 1.55 }}>{FEAT_EN[f.key].desc}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setStep(1)} style={{
                flex: 1, padding: '0.55rem',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.68rem', color: '#6b7fa3',
              }}>{t('wm_new_crypto')}</button>
              <button onClick={dismiss} style={{
                flex: 2, padding: '0.65rem',
                background: 'linear-gradient(135deg, rgba(0,212,255,0.14), rgba(167,139,250,0.14))',
                border: '1px solid rgba(0,212,255,0.4)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.8rem', fontWeight: 700, color: '#00d4ff',
                letterSpacing: '1px',
              }}>{t('wm_launch')}</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="fade-in">
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📖</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa', marginBottom: 5 }}>{t('wm_glossary_title')}</div>
              <div style={{ fontSize: '0.67rem', color: '#6b7fa3' }}>{t('wm_glossary_subtitle')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.4rem' }}>
              {GLOSSARY_TERMS.map(term => (
                <div key={term} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.4rem 0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', fontWeight: 700, color: '#00d4ff', minWidth: 58, flexShrink: 0 }}>{term}</span>
                  <span style={{ fontSize: '0.67rem', color: '#8fa8c8', lineHeight: 1.55 }}>{GLOSS_EN[term]}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#6b7fa3' }}>{t('wm_back')}</button>
              <button onClick={dismiss} style={{ flex: 2, padding: '0.6rem', background: 'rgba(167,139,250,0.13)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 7, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa' }}>
                {t('wm_ready')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
