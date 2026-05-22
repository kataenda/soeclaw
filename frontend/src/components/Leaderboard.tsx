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

const REGISTRY = "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d";

const TOKEN_IDS: Record<string, number> = {
  AlphaQuant: 0,
  WhaleWatcher: 1,
  MacroAnalyzer: 3,
  RiskManager: 4,
};

const Leaderboard: React.FC = () => {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [onchain, setOnchain] = useState<Record<string, OnchainData>>({});

  useEffect(() => {
    fetch(`${API_URL}/api/agents`)
      .then(res => res.json())
      .then(data => {
        const sorted = data.map((a: any) => ({
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
      .catch(() => {
        setAgents([
          { id: 1, name: 'AlphaQuant',    wallet_address: '0x32A...f42', roi: 34.2, winrate: 76.5, trust_score: 94, total_trades: 0 },
          { id: 2, name: 'WhaleWatcher',  wallet_address: '0x8B9...a91', roi: 21.8, winrate: 68.2, trust_score: 87, total_trades: 0 },
          { id: 3, name: 'RiskManager',   wallet_address: '0x1F2...d43', roi: 14.5, winrate: 89.1, trust_score: 98, total_trades: 0 },
          { id: 4, name: 'MacroAnalyzer', wallet_address: '0xE5d...772', roi: 8.9,  winrate: 55.4, trust_score: 72, total_trades: 0 },
        ]);
      });

    fetch(`${API_URL}/api/agents/onchain`)
      .then(res => res.json())
      .then((data: OnchainData[]) => {
        const map: Record<string, OnchainData> = {};
        data.forEach(d => { map[d.name] = d; });
        setOnchain(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="panel mono-text" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <h3 className="text-cyan" style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-neon)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        {t('leaderboard_title')}
      </h3>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
        {agents.map((agent, i) => {
          const oc = onchain[agent.name];
          const tokenId = TOKEN_IDS[agent.name];
          const explorerUrl = tokenId !== undefined
            ? `https://explorer.sepolia.mantle.xyz/token/${REGISTRY}?a=${tokenId}`
            : undefined;

          return (
            <div key={agent.id} style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.5rem', border: '1px solid rgba(0, 255, 204, 0.1)', borderRadius: '6px' }}>
              <div>
                <span className="text-cyan" style={{ fontWeight: 'bold' }}>#{i + 1} {agent.name}</span>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{agent.wallet_address.slice(0, 8)}...</div>
                {oc !== undefined && (
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', color: '#f7931a', background: 'rgba(247,147,26,0.1)', padding: '0.1rem 0.35rem', borderRadius: '3px', border: '1px solid rgba(247,147,26,0.3)' }}>
                      ERC-8004
                    </span>
                    {' '}
                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.62rem', color: '#f7931a', textDecoration: 'underline' }}
                      >
                        Token #{tokenId}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', color: agent.roi >= 0 ? 'var(--accent-green)' : '#ff3366' }}>
                  {agent.roi >= 0 ? '+' : ''}{agent.roi}% ROI
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('leaderboard_wr')}: {agent.winrate}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('leaderboard_trades')}: {agent.total_trades}</div>
                {oc !== undefined && (
                  <div style={{ fontSize: '0.65rem', color: '#f7931a', marginTop: '0.2rem' }}>
                    ⛓ {oc.onchain_trades} trades · rep {oc.reputation >= 0 ? '+' : ''}{oc.reputation}
                  </div>
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
