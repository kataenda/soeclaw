import { useEffect, useState } from 'react';
import './index.css';
import TerminalConsole from './components/TerminalConsole';
import MarketChart from './components/MarketChart';
import ActivePositions from './components/ActivePositions';
import Leaderboard from './components/Leaderboard';
import WalletPanel from './components/WalletPanel';
import LoginPage from './components/LoginPage';
import StrategyPanel from './components/StrategyPanel';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useTranslation } from './i18n/TranslationContext';
import { WS_URL } from './config';

export type Trade = {
  symbol: string;
  action: string;
  price: number;
  tx_hash: string;
  explorer_url?: string;
  erc8004?: boolean;
  agent?: string;
  confidence?: number;
  created_at?: string;
};

export type Thought = {
  agent_name: string;
  message: string;
  msg_type: string;
  explorer_url?: string;
  tx_hash?: string;
};

export type PriceInfo = { price: number; change_24h: number };
export type Prices = Record<string, PriceInfo>;

function App() {
  const { t } = useTranslation();
  const [token, setToken]         = useState<string | null>(() => localStorage.getItem('sc_token'));
  const [username, setUsername]   = useState<string>(() => localStorage.getItem('sc_user') ?? '');
  const [thoughts, setThoughts]   = useState<Thought[]>([]);
  const [trades, setTrades]       = useState<Trade[]>([]);
  const [agentRunning, setAgentRunning]     = useState<boolean>(true);
  const [bybitConnected, setBybitConnected] = useState<boolean>(false);
  const [mobileTab, setMobileTab]           = useState<'market' | 'agents' | 'terminal'>('market');
  const [newTxHash, setNewTxHash]           = useState<string | null>(null);
  const [prices, setPrices]       = useState<Prices>({
    'BTC/USDT': { price: 0, change_24h: 0 },
    'ETH/USDT': { price: 0, change_24h: 0 },
    'MNT/USDT': { price: 0, change_24h: 0 },
  });

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
    fetch(`${API}/api/trades`)
      .then(r => r.json())
      .then((data: Trade[]) => setTrades(data.slice(0, 20)))
      .catch(() => {});
    fetch(`${API}/api/thought-stream`)
      .then(r => r.json())
      .then((data: { agent_name: string; message: string; msg_type: string }[]) =>
        setThoughts(data.slice(0, 50).map(t => ({ agent_name: t.agent_name, message: t.message, msg_type: t.msg_type })))
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${WS_URL}/ws`);

      ws.onopen = () => console.log('[WS] Connected');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'THOUGHT') {
            setThoughts(prev => [msg.data, ...prev].slice(0, 50));
          } else if (msg.type === 'TRADE') {
            setTrades(prev => [msg.data, ...prev].slice(0, 20));
            setNewTxHash(msg.data.tx_hash);
            setTimeout(() => setNewTxHash(null), 1600);
            // Inject ERC-8004 on-chain confirmation into terminal
            if (msg.data.erc8004 && msg.data.tx_hash) {
              const chainThought: Thought = {
                agent_name: 'MANTLE',
                message: `ERC-8004 identity updated — ${msg.data.agent} ${msg.data.action} ${msg.data.symbol} recorded on-chain`,
                msg_type: 'CHAIN',
                tx_hash: msg.data.tx_hash,
                explorer_url: msg.data.explorer_url,
              };
              setThoughts(prev => [chainThought, ...prev].slice(0, 50));
            }
          } else if (msg.type === 'PRICE_UPDATE') {
            setPrices(msg.data);
          } else if (msg.type === 'AGENT_STATUS') {
            setAgentRunning(msg.data.running);
            if (msg.data.bybit_connected !== undefined) setBybitConnected(msg.data.bybit_connected);
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!destroyed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000, 'Component unmounted');
      }
    };
  }, []);

  const toggleAgent = async () => {
    const endpoint = agentRunning ? '/api/agent/stop' : '/api/agent/start';
    await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}${endpoint}`, { method: 'POST' });
  };

  const handleLogin = (tk: string, u: string) => { setToken(tk); setUsername(u); };
  const handleLogout = () => {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    setToken(null);
    setUsername('');
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <>
      <div className="scanline-overlay"></div>
      <div className="dashboard-grid">

        {/* Top Header */}
        <div className="panel topbar">
          <div>
            <h1 className="text-cyan mono-text" style={{ fontSize: '1.5rem' }}>
              SOECLAW OS <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v1.0.0</span>
            </h1>
            <p className="text-muted mono-text" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              {t('sys_subtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green-glow)' }}></div>
              <span className="mono-text" style={{ fontSize: '0.8rem', color: 'var(--accent-green)' }}>{t('sys_online')}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: agentRunning ? 'var(--accent-green)' : '#ff3366',
                boxShadow: agentRunning ? '0 0 8px var(--accent-green-glow)' : '0 0 8px #ff3366',
              }} />
              <span className="mono-text" style={{ fontSize: '0.8rem', color: agentRunning ? 'var(--accent-green)' : '#ff3366' }}>
                {agentRunning ? t('agent_running') : t('agent_stopped')}
              </span>
              <button
                className="neon-btn"
                onClick={toggleAgent}
                style={{ fontSize: '0.75rem', background: agentRunning ? 'rgba(255,51,102,0.15)' : undefined, borderColor: agentRunning ? '#ff3366' : undefined, color: agentRunning ? '#ff3366' : undefined }}
              >
                {agentRunning ? t('btn_stop') : t('btn_start')}
              </button>
            </div>

            <LanguageSwitcher />
            <span className="mono-text text-muted" style={{ fontSize: '0.8rem' }}>// {username}</span>
            <button className="neon-btn" onClick={handleLogout} style={{ fontSize: '0.75rem' }}>{t('btn_logout')}</button>
          </div>
        </div>

        {/* Left Sidebar */}
        <div className={`sidebar-left${mobileTab === 'agents' ? ' tab-active' : ''}`}>
          <WalletPanel />
          <Leaderboard />
        </div>

        {/* Center Main Content */}
        <div className={`main-content${mobileTab === 'market' ? ' tab-active' : ''}`}>
          <MarketChart prices={prices} bybitConnected={bybitConnected} />
          <ActivePositions trades={trades} prices={prices} newTxHash={newTxHash} />
        </div>

        {/* Right Sidebar */}
        <div className={`sidebar-right${mobileTab === 'terminal' ? ' tab-active' : ''}`}>
          <TerminalConsole thoughts={thoughts} />
          <StrategyPanel />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="mobile-nav">
          <button className={mobileTab === 'market' ? 'active' : ''} onClick={() => setMobileTab('market')}>
            <span className="nav-icon">📈</span>{t('nav_market')}
          </button>
          <button className={mobileTab === 'agents' ? 'active' : ''} onClick={() => setMobileTab('agents')}>
            <span className="nav-icon">🤖</span>{t('nav_agents')}
          </button>
          <button className={mobileTab === 'terminal' ? 'active' : ''} onClick={() => setMobileTab('terminal')}>
            <span className="nav-icon">💻</span>{t('nav_terminal')}
          </button>
        </nav>

      </div>
    </>
  );
}

export default App;
