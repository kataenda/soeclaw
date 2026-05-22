import React, { useState } from 'react';
import { API_URL } from '../config';

interface Props {
  onLogin: (token: string, username: string) => void;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login'
      ? { username, password }
      : { username, email, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? 'Something went wrong');
      } else {
        localStorage.setItem('sc_token', data.access_token);
        localStorage.setItem('sc_user', data.username);
        onLogin(data.access_token, data.username);
      }
    } catch {
      setError('Cannot connect to backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main)',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div className="scanline-overlay" />

      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="text-cyan" style={{ fontSize: '2rem', letterSpacing: '4px', margin: 0 }}>
            SOECLAW
          </h1>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            AUTONOMOUS AI TRADING PLATFORM
          </p>
          <div style={{ width: '100%', height: '1px', background: 'var(--border-neon)', marginTop: '1rem', boxShadow: '0 0 8px var(--accent-cyan)' }} />
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', border: '1px solid var(--border-neon)', borderRadius: '6px', overflow: 'hidden' }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: mode === m ? 'rgba(0,255,204,0.1)' : 'transparent',
                border: 'none',
                color: mode === m ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                cursor: 'pointer',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {m === 'login' ? '// LOGIN' : '// REGISTER'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              style={{
                width: '100%',
                marginTop: '0.25rem',
                padding: '0.6rem 0.75rem',
                background: 'rgba(0,255,204,0.04)',
                border: '1px solid var(--border-neon)',
                borderRadius: '4px',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  marginTop: '0.25rem',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(0,255,204,0.04)',
                  border: '1px solid var(--border-neon)',
                  borderRadius: '4px',
                  color: 'var(--text-main)',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{
                width: '100%',
                marginTop: '0.25rem',
                padding: '0.6rem 0.75rem',
                background: 'rgba(0,255,204,0.04)',
                border: '1px solid var(--border-neon)',
                borderRadius: '4px',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#ff3366', fontSize: '0.8rem', padding: '0.5rem', border: '1px solid #ff3366', borderRadius: '4px', background: 'rgba(255,51,102,0.08)' }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="neon-btn"
            style={{ padding: '0.75rem', fontSize: '0.85rem', letterSpacing: '2px', marginTop: '0.5rem', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'PROCESSING...' : mode === 'login' ? 'ACCESS SYSTEM' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1.5rem' }}>
          SoeClaw OS v1.0.0 — Mantle Sepolia Testnet
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
