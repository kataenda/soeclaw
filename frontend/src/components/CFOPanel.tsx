import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';
import { useTranslation } from '../i18n/TranslationContext';
import TxApprovalModal from './TxApprovalModal';
import type { TxData } from './TxApprovalModal';

interface ChatMsg { role: 'user' | 'ai'; text: string; byreal?: boolean }

interface Props {
  walletAddress?: string;
  walletBalanceMnt?: number;
  walletGreeting?: string;
}

export default function CFOPanel({ walletAddress = '', walletBalanceMnt = 0, walletGreeting = '' }: Props) {
  const { t } = useTranslation();
  const [msgs,      setMsgs]      = useState<ChatMsg[]>([{ role: 'ai', text: t('cfo_welcome') }]);
  const [pendingTx, setPendingTx] = useState<TxData | null>(null);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [health,    setHealth]    = useState<{ health_score: number; regime: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/cfo/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Show greeting when wallet connects
  useEffect(() => {
    if (!walletGreeting) return;
    setMsgs(prev => [...prev, { role: 'ai', text: walletGreeting }]);
  }, [walletGreeting]);

  const connectToByreal = useCallback(async () => {
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', text: 'Connect wallet to Byreal' }]);
    setLoading(true);
    try {
      let addr = walletAddress;
      if (!addr) {
        const eth = (window as any).ethereum;
        if (!eth) {
          setMsgs(prev => [...prev, { role: 'ai', text: '❌ MetaMask not found. Install MetaMask to connect.' }]);
          setLoading(false);
          return;
        }
        const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
        addr = accounts[0];
      }
      const res = await fetch(`${API_URL}/api/byreal/wallet/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: addr }),
      });
      const data = await res.json();
      if (data.success) {
        const tvl = data.dex_tvl > 0 ? `$${(data.dex_tvl / 1_000_000).toFixed(2)}M` : '—';
        const vol = data.dex_volume_24h > 0 ? `$${(data.dex_volume_24h / 1_000_000).toFixed(2)}M` : '—';
        setMsgs(prev => [...prev, {
          role: 'ai',
          text: `✅ Wallet connected to Byreal!\n\n🔗 ${addr.slice(0,6)}…${addr.slice(-4)}\n⚡ Status: Active\n📊 DEX TVL: ${tvl}\n📈 Vol 24h: ${vol}\n🏊 Pools: ${data.dex_pools}\n\nAgent will now route swaps through your wallet on Byreal CLMM DEX.`,
          byreal: true,
        }]);
      } else {
        setMsgs(prev => [...prev, { role: 'ai', text: `❌ Byreal connection failed: ${data.error}` }]);
      }
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Wallet connection cancelled.' : (err.message ?? 'Connection error');
      setMsgs(prev => [...prev, { role: 'ai', text: `❌ ${msg}` }]);
    }
    setLoading(false);
  }, [walletAddress]);

  const BYREAL_CONNECT_KEYWORDS = ['connect wallet', 'hubungkan wallet', 'connect byreal', 'byreal connect', 'link wallet'];

  const sendMessage = useCallback(async (directText?: string) => {
    const text = (directText ?? input).trim();
    if (!text || loading) return;

    if (BYREAL_CONNECT_KEYWORDS.some(k => text.toLowerCase().includes(k))) {
      await connectToByreal();
      return;
    }

    setInput('');
    const userMsg: ChatMsg = { role: 'user', text };
    setMsgs(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = msgs
        .filter(m => m.role === 'user' || m.role === 'ai')
        .slice(-8)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
      const res = await fetch(`${API_URL}/api/cfo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          wallet_address: walletAddress,
          wallet_balance_mnt: walletBalanceMnt,
        }),
      });
      const data = await res.json();
      const isByreal = data.reply?.includes('BYREAL') || data.reply?.includes('byreal') || data.reply?.includes('perps-cli') || data.reply?.includes('byreal-cli');
      setMsgs(prev => [...prev, { role: 'ai', text: data.reply, byreal: isByreal }]);
      if (data.tx_data) setPendingTx(data.tx_data);
    } catch {
      setMsgs(prev => [...prev, { role: 'ai', text: t('cfo_unreachable') }]);
    }
    setLoading(false);
  }, [input, loading, msgs, connectToByreal, walletAddress, walletBalanceMnt, t]);

  // Wrapper for input field (uses current input state)
  const send = useCallback(() => sendMessage(), [sendMessage]);

  const hScore = health?.health_score ?? null;
  const hColor = hScore == null ? '#6b7fa3' : hScore >= 70 ? '#00e87a' : hScore >= 50 ? '#f59e0b' : '#ff3366';
  const regime = health?.regime ?? 'NEUTRAL';
  const regimeColor = regime === 'RISK_OFF' ? '#ff3366' : regime === 'RISK_ON' ? '#00e87a' : '#f59e0b';

  const QUICK = [t('cfo_quick1'), t('cfo_quick2'), t('cfo_quick3'), t('cfo_quick4')];
  const BYREAL_QUICK = [
    'Byreal help',
    'Byreal perps signals',
    'Perps account info',
    'Perps positions',
    'Perps order list',
    'Account history',
    'ETH signal detail',
    'BTC signal detail',
    'Swap USDT → MNT preview',
    'Top CLMM pools',
    'Wallet balance',
    'Connect Byreal',
  ];

  return (
    <>
    {pendingTx && walletAddress && (
      <TxApprovalModal
        tx={pendingTx}
        walletAddress={walletAddress}
        onClose={() => setPendingTx(null)}
        onSuccess={(hash) => {
          setMsgs(prev => [...prev, { role: 'ai', text: `✅ Transaction sent!\nHash: ${hash.slice(0, 18)}…\nhttps://sepolia.mantlescan.xyz/tx/${hash}` }]);
          setPendingTx(null);
        }}
      />
    )}
    <div className="panel mono-text" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px rgba(167,139,250,0.8)', animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa' }}>AI CFO</span>
          {walletAddress && (
            <span style={{ fontSize: '0.5rem', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.3)', borderRadius: 3, padding: '1px 4px', color: '#00e87a', fontWeight: 700 }}>
              {walletAddress.slice(0, 5)}…{walletAddress.slice(-3)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {hScore !== null && (
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: hColor, background: `${hColor}15`, border: `1px solid ${hColor}33`, borderRadius: 4, padding: '1px 5px' }}>
              {hScore}/100
            </span>
          )}
          <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 3, background: `${regimeColor}12`, border: `1px solid ${regimeColor}33`, color: regimeColor, fontWeight: 700 }}>
            {regime.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: 0 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && m.byreal && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '2px', paddingLeft: '2px' }}>
                <span style={{ fontSize: '0.48rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.35)', color: '#f7931a', fontWeight: 700 }}>
                  ⚡ Byreal
                </span>
              </div>
            )}
            <div style={{
              maxWidth: '90%',
              padding: '0.35rem 0.55rem',
              borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
              background: m.role === 'user' ? 'rgba(167,139,250,0.15)' : 'rgba(0,212,255,0.07)',
              border: `1px solid ${m.role === 'user' ? 'rgba(167,139,250,0.3)' : 'rgba(0,212,255,0.12)'}`,
              fontSize: '0.62rem',
              color: m.role === 'user' ? '#c4b5fd' : '#c0cce0',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.25rem 0.4rem' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#a78bfa', animation: `pulse 1s ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick prompts — Dropdowns */}
      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
        {/* CFO Commands Dropdown */}
        <div style={{ position: 'relative', flex: 1 }}>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                setInput('');
                sendMessage(val);
              }
            }}
            style={{
              width: '100%',
              fontSize: '0.58rem',
              padding: '0.3rem 1.4rem 0.3rem 0.45rem',
              borderRadius: 5,
              cursor: 'pointer',
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.25)',
              color: '#a78bfa',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a78bfa' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.4rem center',
            }}
          >
            <option value="" disabled hidden style={{ background: '#0d1117', color: '#6b7fa3' }}>
              CFO Commands
            </option>
            {QUICK.map(q => (
              <option key={q} value={q} style={{ background: '#0d1117', color: '#a78bfa', padding: '4px' }}>
                {q}
              </option>
            ))}
          </select>
        </div>

        {/* Byreal CLI Dropdown */}
        <div style={{ position: 'relative', flex: 1 }}>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                setInput('');
                sendMessage(val);
              }
            }}
            style={{
              width: '100%',
              fontSize: '0.58rem',
              padding: '0.3rem 1.4rem 0.3rem 0.45rem',
              borderRadius: 5,
              cursor: 'pointer',
              background: 'rgba(247,147,26,0.06)',
              border: '1px solid rgba(247,147,26,0.25)',
              color: '#f7931a',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23f7931a' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.4rem center',
            }}
          >
            <option value="" disabled hidden style={{ background: '#0d1117', color: '#6b7fa3' }}>
              Byreal CLI
            </option>
            {BYREAL_QUICK.map(q => (
              <option key={q} value={q} style={{ background: '#0d1117', color: '#f7931a', padding: '4px' }}>
                {q}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={t('cfo_placeholder')}
          style={{
            flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(167,139,250,0.25)',
            borderRadius: 5, color: '#c0cce0', fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.65rem', padding: '0.35rem 0.5rem', outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '0.35rem 0.65rem', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', fontWeight: 700,
            background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.4)',
            color: '#a78bfa', opacity: (!input.trim() || loading) ? 0.4 : 1,
          }}
        >→</button>
      </div>
    </div>
    </>
  );
}
