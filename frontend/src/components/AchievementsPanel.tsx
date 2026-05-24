import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/TranslationContext';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlocked_by?: string;
  condition: string;
}

interface AgentEconomy {
  name: string;
  virtual_balance_mnt: number;
  skills: string[];
  trade_count: number;
  win_rate_pct: number;
}

interface EconomyData {
  agents: AgentEconomy[];
  total_mnt_in_system: number;
  byreal_skills_endpoint: string;
}

export default function AchievementsPanel() {
  const { t } = useTranslation();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [economy, setEconomy] = useState<EconomyData | null>(null);
  const [activeTab, setActiveTab] = useState<'badges' | 'economy'>('badges');
  const [copied, setCopied] = useState(false);
  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  useEffect(() => {
    fetch(`${API}/api/achievements`)
      .then(r => r.json())
      .then(d => setAchievements(Array.isArray(d) ? d : (d.achievements ?? [])))
      .catch(() => {});

    fetch(`${API}/api/agents/economy`)
      .then(r => r.json())
      .then(d => setEconomy(d))
      .catch(() => {});
  }, []);

  const handleShare = async () => {
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const shareText = `🤖 SoeClaw AI — ${unlockedCount}/${achievements.length} badges unlocked! Autonomous AI trading on Mantle L2. #SoeClaw #MantleNetwork #DeFAI`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'SoeClaw AI Trading', text: shareText, url: shareUrl });
        return;
      } catch { /* fall through to clipboard */ }
    }
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.85rem' }}>// AGENT_ECONOMY</h3>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {(['badges', 'economy'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="neon-btn"
              style={{
                fontSize: '0.7rem',
                background: activeTab === tab ? 'rgba(0,212,255,0.15)' : undefined,
                borderColor: activeTab === tab ? '#00d4ff' : undefined,
                color: activeTab === tab ? '#00d4ff' : undefined,
              }}
            >
              {tab === 'badges' ? t('ach_badges_tab') : t('ach_economy_tab')}
            </button>
          ))}
        </div>
      </div>

      {/* BADGES TAB */}
      {activeTab === 'badges' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span className="mono-text text-muted" style={{ fontSize: '0.72rem' }}>
              {unlockedCount}/{achievements.length} unlocked
            </span>
            <button
              className="neon-btn"
              onClick={handleShare}
              style={{ fontSize: '0.72rem', background: copied ? 'rgba(0,255,136,0.15)' : undefined, borderColor: copied ? '#00ff88' : undefined, color: copied ? '#00ff88' : undefined }}
            >
              {copied ? t('share_copied') : t('ach_share')}
            </button>
          </div>

          {/* Progress bar */}
          {achievements.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(unlockedCount / achievements.length) * 100}%`, background: 'linear-gradient(90deg, #00d4ff, #00ff88)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {achievements.map(ach => (
              <div
                key={ach.id}
                style={{
                  background: ach.unlocked ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${ach.unlocked ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '8px',
                  padding: '0.6rem',
                  opacity: ach.unlocked ? 1 : 0.5,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{ach.icon}</div>
                <div className="mono-text" style={{ fontSize: '0.72rem', fontWeight: 700, color: ach.unlocked ? '#00ff88' : '#888', marginBottom: '0.15rem' }}>{ach.name}</div>
                <div className="mono-text" style={{ fontSize: '0.63rem', color: '#666' }}>{ach.description}</div>
                {ach.unlocked && ach.unlocked_by && (
                  <div className="mono-text" style={{ fontSize: '0.6rem', color: '#00d4ff', marginTop: '0.2rem' }}>by {ach.unlocked_by}</div>
                )}
              </div>
            ))}
          </div>

          {achievements.length === 0 && (
            <p className="mono-text text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', padding: '1rem' }}>{t('ach_no_data')}</p>
          )}
        </>
      )}

      {/* ECONOMY TAB */}
      {activeTab === 'economy' && economy && (
        <>
          <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
            <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>{t('economy_total_mnt')}</div>
            <div className="mono-text text-cyan" style={{ fontSize: '1.2rem', fontWeight: 700 }}>{economy.total_mnt_in_system.toLocaleString()} MNT</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {economy.agents.map(agent => (
              <div key={agent.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span className="mono-text" style={{ color: '#00d4ff', fontSize: '0.8rem', fontWeight: 700 }}>{agent.name}</span>
                  <span className="mono-text" style={{ color: '#00ff88', fontSize: '0.8rem' }}>{agent.virtual_balance_mnt.toLocaleString()} MNT</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="mono-text text-muted" style={{ fontSize: '0.65rem' }}>{agent.trade_count} {t('economy_trades')}</span>
                  <span className="mono-text" style={{ fontSize: '0.65rem', color: agent.win_rate_pct >= 50 ? '#00ff88' : '#ff3366' }}>{agent.win_rate_pct.toFixed(1)}% {t('economy_wr')}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                  {agent.skills.map(skill => (
                    <span
                      key={skill}
                      className="mono-text"
                      style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '0.6rem', padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
            <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>BYREAL SKILLS ENDPOINT</div>
            <div className="mono-text" style={{ fontSize: '0.65rem', color: '#888', wordBreak: 'break-all' }}>{economy.byreal_skills_endpoint}</div>
          </div>
        </>
      )}

      {activeTab === 'economy' && !economy && (
        <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>{t('ach_loading_economy')}</p>
      )}
    </div>
  );
}
