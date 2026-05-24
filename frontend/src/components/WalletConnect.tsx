import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_URL, MANTLE_NETWORK } from '../config';

interface Props {
  onConnect: (address: string, balanceMnt: number, greeting: string) => void;
  onDisconnect?: () => void;
}

interface WalletOption {
  name: string;
  icon: string;
  provider: any;
}

const MANTLE_CHAIN = {
  chainId:             MANTLE_NETWORK.chainId,
  chainName:           MANTLE_NETWORK.chainName,
  nativeCurrency:      { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls:             [MANTLE_NETWORK.rpcUrl],
  blockExplorerUrls:   [MANTLE_NETWORK.explorerUrl],
};

const INSTALL_LINKS = [
  { name: 'MetaMask',       icon: '🦊', url: 'https://metamask.io/download' },
  { name: 'Rabby',          icon: '🐰', url: 'https://rabby.io' },
  { name: 'Coinbase Wallet',icon: '🔵', url: 'https://www.coinbase.com/wallet' },
  { name: 'OKX Wallet',     icon: '⭕', url: 'https://www.okx.com/web3' },
];

function detectWallets(): WalletOption[] {
  const win = window as any;
  if (!win.ethereum) return [];
  const providers: any[] = win.ethereum.providers ?? [win.ethereum];
  const found: WalletOption[] = [];
  for (const p of providers) {
    if (p.isRabby)                          found.push({ name: 'Rabby',           icon: '🐰', provider: p });
    else if (p.isMetaMask)                  found.push({ name: 'MetaMask',        icon: '🦊', provider: p });
    else if (p.isCoinbaseWallet)            found.push({ name: 'Coinbase Wallet', icon: '🔵', provider: p });
    else if (p.isTrust || p.isTrustWallet) found.push({ name: 'Trust Wallet',    icon: '🛡️', provider: p });
    else if (p.isOKExWallet || p.isOkxWallet) found.push({ name: 'OKX Wallet',   icon: '⭕', provider: p });
    else if (p.isBraveWallet)               found.push({ name: 'Brave Wallet',   icon: '🦁', provider: p });
    else if (p.isPhantom)                   found.push({ name: 'Phantom',         icon: '👻', provider: p });
    else                                    found.push({ name: 'Web3 Wallet',     icon: '💼', provider: p });
  }
  return found.filter((w, i, arr) => arr.findIndex(x => x.name === w.name) === i);
}

export default function WalletConnect({ onConnect, onDisconnect }: Props) {
  const [address, setAddress]       = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [connecting, setConnecting] = useState('');
  const [wallets, setWallets]       = useState<WalletOption[]>([]);

  useEffect(() => { setWallets(detectWallets()); }, []);

  const connectWith = async (w: WalletOption) => {
    setConnecting(w.name);
    try {
      const accounts: string[] = await w.provider.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      try {
        await w.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MANTLE_CHAIN.chainId }] });
      } catch (sw: any) {
        if (sw.code === 4902)
          await w.provider.request({ method: 'wallet_addEthereumChain', params: [MANTLE_CHAIN] });
      }
      const res  = await fetch(`${API_URL}/api/wallet/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = await res.json();
      setAddress(addr);
      setShowModal(false);
      onConnect(addr, data.balance_mnt ?? 0, data.greeting ?? `Wallet connected.`);
    } catch (err: any) {
      if (err.code !== 4001) console.error('Wallet connect failed', err);
    }
    setConnecting('');
  };

  if (address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0.12rem 0.4rem', background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 10 }}>
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00e87a', boxShadow: '0 0 4px #00e87a' }} />
        <span className="mono-text" style={{ fontSize: '0.55rem', color: '#00e87a' }}>
          {address.slice(0, 5)}…{address.slice(-3)}
        </span>
        <button
          onClick={() => { setAddress(''); setWallets(detectWallets()); onDisconnect?.(); }}
          title="Disconnect wallet"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,51,102,0.5)', fontSize: '0.6rem', padding: '0 1px', lineHeight: 1, marginLeft: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ff3366')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,51,102,0.5)')}
        >✕</button>
      </div>
    );
  }

  const modal = showModal && createPortal(
    <div
      onClick={() => setShowModal(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0d1120', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 16, padding: '1.5rem', width: 340, boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,212,255,0.05)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e0e6f0', fontFamily: 'JetBrains Mono, monospace' }}>Connect Wallet</div>
            <div style={{ fontSize: '0.62rem', color: '#6b7fa3', marginTop: 2 }}>{MANTLE_NETWORK.displayName}</div>
          </div>
          <button onClick={() => setShowModal(false)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#6b7fa3', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        {/* Wallet list */}
        {wallets.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wallets.map(w => (
              <button key={w.name} onClick={() => connectWith(w)} disabled={!!connecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.75rem 1rem', borderRadius: 10, cursor: 'pointer',
                  background: connecting === w.name ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${connecting === w.name ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: '#e0e6f0', fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.78rem', fontWeight: 600, textAlign: 'left',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { if (!connecting) { e.currentTarget.style.background = 'rgba(0,212,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)'; }}}
                onMouseLeave={e => { if (connecting !== w.name) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}}
              >
                <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{w.icon}</span>
                <span style={{ flex: 1 }}>{w.name}</span>
                {connecting === w.name
                  ? <span style={{ fontSize: '0.6rem', color: '#00d4ff' }}>Connecting…</span>
                  : <span style={{ fontSize: '0.65rem', color: '#3d5070' }}>→</span>
                }
              </button>
            ))}
          </div>
        ) : (
          /* No wallet installed */
          <div>
            <div style={{ padding: '0.75rem', background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.15)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.7rem', color: '#ff6680', lineHeight: 1.6 }}>
              No wallet extension detected in your browser.
            </div>
            <div style={{ fontSize: '0.65rem', color: '#6b7fa3', marginBottom: '0.65rem' }}>Install one to continue:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INSTALL_LINKS.map(w => (
                <a key={w.name} href={w.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.6rem 0.85rem', borderRadius: 9,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none',
                  }}>
                  <span style={{ fontSize: '1.2rem' }}>{w.icon}</span>
                  <span style={{ flex: 1 }}>{w.name}</span>
                  <span style={{ fontSize: '0.6rem', color: '#3d5070' }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem', fontSize: '0.58rem', color: '#3d5070', textAlign: 'center', lineHeight: 1.5 }}>
          By connecting you agree to use {MANTLE_NETWORK.displayName}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {modal}
      <button
        className="neon-btn"
        onClick={() => setShowModal(true)}
        style={{ fontSize: '0.55rem', padding: '0.15rem 0.45rem', borderColor: 'rgba(0,212,255,0.4)', color: '#00d4ff' }}
      >
        🔗 Connect
      </button>
    </>
  );
}
