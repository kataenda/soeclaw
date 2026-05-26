import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';

interface AgentData {
  id: number;
  name: string;
  wallet_address: string;
  roi: number;
  winrate: number;
  trust_score: number;
  total_trades: number;
}

interface OnchainData {
  name: string;
  onchain_trades: number;
  reputation: number;
}

const REGISTRY = "0x389DF777f009d32c4B6451F159c763c7f9d15803";

const TOKEN_IDS: Record<string, number> = {
  AlphaQuant: 0,
  WhaleWatcher: 1,
  MacroAnalyzer: 2,
  RiskManager: 3,
};

const Leaderboard: React.FC = () => {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [onchain, setOnchain] = useState<Record<string, OnchainData>>({});
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAgents = () => {
    setError(false);
    setLoading(true);

    fetch(`${API_URL}/api/agents`)
      .then(res => { if (!res.ok) throw new Error('bad response'); return res.json(); })
      .then(data => {
        const sorted = data.map((a: AgentData) => ({
          id: a.id,
          name: a.name,
          wallet_address: a.wallet_address,
          roi: parseFloat((a.roi ?? 0).toFixed(2)),
          winrate: parseFloat((a.winrate ?? 0).toFixed(1)),
          trust_score: Math.floor(a.trust_score ?? 50),
          total_trades: a.total_trades ?? 0,
        })).sort((x: AgentData, y: AgentData) => y.roi - x.roi);
        setAgents(sorted);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    fetch(`${API_URL}/api/agents/onchain`)
      .then(res => res.json())
      .then((data: OnchainData[]) => {
        const map: Record<string, OnchainData> = {};
        data.forEach(d => { map[d.name] = d; });
        setOnchain(map);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchAgents(); }, []);

  return (
    <div className="panel mono-text" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <h3 className="panel-title">{t('leaderboard_title')}</h3>

      {error && (
        <div style={{ fontSize: '0.72rem', color: '#ff3366', padding: '0.4rem 0.6rem', border: '1px solid rgba(255,51,102,0.3)', borderRadius: '4px', background: 'rgba(255,51,102,0.06)', marginBottom: '0.5rem' }}>
          Failed to load agents —{' '}
          <button onClick={fetchAgents} style={{ background: 'none', border: 'none', color: '#ff3366', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}>
            retry
          </button>
        </div>
      )}
      {loading && !error && (
        <div className="text-muted" style={{ fontSize: '0.8rem' }}>Loading...</div>
      )}

      <div role="list" aria-label="Agent leaderboard" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', maxHeight: '360px', paddingRight: '2px' }}>
        {agents.map((agent, i) => {
          const oc = onchain[agent.name];
          const tokenId = TOKEN_IDS[agent.name];
          const explorerUrl = tokenId !== undefined
            ? `https://explorer.mantle.xyz/token/${REGISTRY}?a=${tokenId}`
            : undefined;
          const rankColors = ['#f59e0b', '#94a3b8', '#cd7f32'];

          return (
            <div key={agent.id} role="listitem" aria-label={`${agent.name}, rank ${i + 1}, ROI ${agent.roi}%`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span className="mono-text" style={{ fontSize: '0.68rem', fontWeight: 700, color: rankColors[i] ?? 'var(--text-muted)' }}>#{i + 1}</span>
                  <span className="mono-text text-cyan" style={{ fontWeight: 700, fontSize: '0.82rem' }}>{agent.name}</span>
                </div>
                <div className="mono-text text-muted" style={{ fontSize: '0.68rem' }}>{agent.wallet_address.slice(0, 8)}...</div>
                {oc !== undefined && (
                  <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.62rem', color: '#f7931a', background: 'rgba(247,147,26,0.1)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(247,147,26,0.3)' }}>ERC-8004</span>
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.62rem', color: '#f7931a', textDecoration: 'underline' }}>
                        #{tokenId}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono-text" style={{ fontWeight: 700, fontSize: '0.85rem', color: agent.roi >= 0 ? 'var(--green)' : 'var(--pink)' }}>
                  {agent.roi >= 0 ? '+' : ''}{agent.roi}%
                </div>
                <div className="mono-text text-muted" style={{ fontSize: '0.68rem' }}>{t('leaderboard_wr')} {agent.winrate}%</div>
                <div className="mono-text text-muted" style={{ fontSize: '0.68rem' }}>{agent.total_trades} {t('leaderboard_trades')}</div>
                {oc !== undefined && (
                  <div className="mono-text" style={{ fontSize: '0.62rem', color: '#f7931a', marginTop: '0.15rem' }}>⛓ {oc.onchain_trades} on-chain</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
