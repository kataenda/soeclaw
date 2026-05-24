import { useEffect, useState } from 'react';
import './index.css';
import TerminalConsole from './components/TerminalConsole';
import MarketChart from './components/MarketChart';
import ActivePositions from './components/ActivePositions';
import WalletPanel from './components/WalletPanel';
import LoginPage from './components/LoginPage';
import LanguageSwitcher from './components/LanguageSwitcher';
import BottomPanel from './components/BottomPanel';
import ByrealPanel from './components/ByrealPanel';
import CFOPanel from './components/CFOPanel';
import WelcomeModal from './components/WelcomeModal';
import FinancialDashboard from './components/FinancialDashboard';
import AlphaScorecard from './components/AlphaScorecard';
import SentimentPanel from './components/SentimentPanel';
import ShareAlphaCard from './components/ShareAlphaCard';
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
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [mobileTab, setMobileTab]           = useState<'market' | 'agents' | 'terminal'>('market');
  const [newTxHash, setNewTxHash]           = useState<string | null>(null);
  const [showFinancial, setShowFinancial]   = useState(false);
  const [showShareCard, setShowShareCard]   = useState(false);
  const [prices, setPrices]       = useState<Prices>({
    'BTC/USDT':  { price: 0, change_24h: 0 },
    'ETH/USDT':  { price: 0, change_24h: 0 },
    'MNT/USDT':  { price: 0, change_24h: 0 },
    'mETH/USDT': { price: 0, change_24h: 0 },
    'COOK/USDT': { price: 0, change_24h: 0 },
    'FBTC/USDT': { price: 0, change_24h: 0 },
    'WMNT/USDT': { price: 0, change_24h: 0 },
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

      ws.onopen = () => { console.log('[WS] Connected'); setWsConnected(true); };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'THOUGHT') {
            setThoughts(prev => [msg.data, ...prev].slice(0, 50));
          } else if (msg.type === 'TRADE') {
            setTrades(prev => [msg.data, ...prev].slice(0, 20));
            setNewTxHash(msg.data.tx_hash);
            setTimeout(() => setNewTxHash(null), 1600);
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

      ws.onerror = () => { setWsConnected(false); };

      ws.onclose = () => {
        setWsConnected(false);
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
      <WelcomeModal />
      {showFinancial && <FinancialDashboard onClose={() => setShowFinancial(false)} />}
      {showShareCard && <ShareAlphaCard onClose={() => setShowShareCard(false)} />}
      <div className="scanline-overlay"></div>
      <div className="dashboard-grid">

        {/* Top Header */}
        <div className="panel topbar" style={{ padding: '0.85rem 1.25rem' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,232,122,0.1))', border: '1px solid rgba(0,212,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
              🤖
            </div>
            <div>
              <h1 className="mono-text text-cyan" style={{ fontSize: '1.15rem', lineHeight: 1, letterSpacing: '-0.5px' }}>
                SOECLAW <span style={{ color: '#a78bfa' }}>AI CFO</span> <span className="mono-text text-muted" style={{ fontSize: '0.68rem', fontWeight: 400 }}>v2.0</span>
              </h1>
              <p className="mono-text text-muted" style={{ fontSize: '0.68rem', marginTop: '2px' }}>{t('sys_subtitle')}</p>
            </div>
          </div>

          {/* Status + controls */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* System online */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.65rem', background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: '20px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green-glow)' }} />
              <span className="mono-text" style={{ fontSize: '0.68rem', color: 'var(--green)' }}>{t('sys_online')}</span>
            </div>

            {/* WS status */}
            {!wsConnected && (
              <div role="status" aria-live="polite" aria-label="WebSocket reconnecting" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.65rem', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.3)', borderRadius: '20px' }}>
                <div aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff9900', animation: 'pulse 1s infinite' }} />
                <span className="mono-text" style={{ fontSize: '0.68rem', color: '#ff9900' }}>WS RECONNECTING</span>
              </div>
            )}

            {/* Agent toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.65rem', background: agentRunning ? 'rgba(0,232,122,0.08)' : 'rgba(255,51,102,0.08)', border: `1px solid ${agentRunning ? 'rgba(0,232,122,0.2)' : 'rgba(255,51,102,0.25)'}`, borderRadius: '20px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: agentRunning ? 'var(--green)' : 'var(--pink)', boxShadow: `0 0 6px ${agentRunning ? 'var(--green-glow)' : 'var(--pink-glow)'}` }} />
              <span className="mono-text" style={{ fontSize: '0.68rem', color: agentRunning ? 'var(--green)' : 'var(--pink)' }}>
                {agentRunning ? t('agent_running') : t('agent_stopped')}
              </span>
              <button onClick={toggleAgent} className="neon-btn"
                aria-label={agentRunning ? 'Stop AI agents' : 'Start AI agents'}
                style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderColor: agentRunning ? 'rgba(255,51,102,0.5)' : 'rgba(0,232,122,0.5)', color: agentRunning ? 'var(--pink)' : 'var(--green)', background: 'transparent' }}>
                {agentRunning ? t('btn_stop') : t('btn_start')}
              </button>
            </div>

            <LanguageSwitcher />
            <button
              className="neon-btn"
              onClick={() => setShowFinancial(true)}
              aria-label="Open AI CFO Financial Dashboard"
              style={{ fontSize: '0.68rem', borderColor: 'rgba(167,139,250,0.5)', color: '#a78bfa', fontWeight: 700 }}
            >
              CFO Dashboard
            </button>
            <button
              className="neon-btn"
              onClick={() => setShowShareCard(true)}
              aria-label="Share Alpha Card"
              style={{ fontSize: '0.68rem', borderColor: 'rgba(0,232,122,0.5)', color: '#00e87a', fontWeight: 700 }}
            >
              Share Alpha
            </button>
            <span className="mono-text text-muted" style={{ fontSize: '0.72rem' }}>// {username}</span>
            <button className="neon-btn" onClick={handleLogout} aria-label="Log out" style={{ fontSize: '0.7rem', borderColor: 'rgba(255,51,102,0.4)', color: 'var(--pink)' }}>{t('btn_logout')}</button>
          </div>
        </div>

        {/* Left Sidebar */}
        <div className={`sidebar-left${mobileTab === 'agents' ? ' tab-active' : ''}`} role="complementary" aria-label="Agent wallet and thought stream">
          <WalletPanel />
          <AlphaScorecard />
        </div>

        {/* Center Main Content */}
        <div className={`main-content${mobileTab === 'market' ? ' tab-active' : ''}`} role="main" aria-label="Market charts and positions">
          {/* Charts column */}
          <div style={{ display: 'flex', flex: 1, flexDirection: 'row', gap: '0.85rem', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.85rem', minWidth: 0, overflow: 'hidden' }}>
              <MarketChart prices={prices} bybitConnected={bybitConnected} />
              <ActivePositions trades={trades} prices={prices} newTxHash={newTxHash} />
            </div>
            <ByrealPanel />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={`sidebar-right${mobileTab === 'terminal' ? ' tab-active' : ''}`} role="complementary" aria-label="AI CFO">
          <SentimentPanel />
          <CFOPanel />
        </div>

        {/* Bottom Panel — AI Thought Stream + SOECLAW Insights */}
        <div style={{ gridColumn: '1 / 3', display: 'flex', gap: '0.85rem', overflow: 'hidden', minHeight: '260px' }}>
          <div style={{ width: '268px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <TerminalConsole thoughts={thoughts} />
          </div>
          <BottomPanel />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button className={mobileTab === 'market' ? 'active' : ''} onClick={() => setMobileTab('market')}
            aria-label={t('nav_market')} aria-pressed={mobileTab === 'market'}>
            <span className="nav-icon" aria-hidden="true">📈</span>{t('nav_market')}
          </button>
          <button className={mobileTab === 'agents' ? 'active' : ''} onClick={() => setMobileTab('agents')}
            aria-label={t('nav_agents')} aria-pressed={mobileTab === 'agents'}>
            <span className="nav-icon" aria-hidden="true">🤖</span>{t('nav_agents')}
          </button>
          <button className={mobileTab === 'terminal' ? 'active' : ''} onClick={() => setMobileTab('terminal')}
            aria-label={t('nav_terminal')} aria-pressed={mobileTab === 'terminal'}>
            <span className="nav-icon" aria-hidden="true">💻</span>{t('nav_terminal')}
          </button>
        </nav>

      </div>
    </>
  );
}

export default App;
