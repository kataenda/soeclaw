import { useEffect, useState } from 'react';

interface GasOperation {
  gas_units: number;
  cost_mnt: number;
  cost_usd: number;
}

interface GasData {
  gas_price_gwei: number;
  network: string;
  currency: string;
  mnt_usd: number;
  note: string;
  operations: Record<string, GasOperation>;
}

interface AuditIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  recommendation: string;
  line_ref: string;
}

interface AuditResult {
  risk_score: number;
  summary: string;
  issues: AuditIssue[];
  gas_optimisations: { title: string; estimated_savings: string }[];
  mantle_specific: string[];
  overall_verdict: 'SAFE' | 'NEEDS_REVIEW' | 'UNSAFE';
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ff3366', HIGH: '#ff6600', MEDIUM: '#ffaa00', LOW: '#00d4ff', INFO: '#888',
};

const VERDICT_COLOR: Record<string, string> = {
  SAFE: '#00ff88', NEEDS_REVIEW: '#ffaa00', UNSAFE: '#ff3366',
};

export default function DevToolsPanel() {
  const [gasData, setGasData] = useState<GasData | null>(null);
  const [gasLoading, setGasLoading] = useState(true);
  const [auditCode, setAuditCode] = useState('');
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [activeTab, setActiveTab] = useState<'gas' | 'audit'>('gas');
  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  useEffect(() => {
    fetch(`${API}/api/devtools/gas`)
      .then(r => r.json())
      .then(d => { setGasData(d); setGasLoading(false); })
      .catch(() => setGasLoading(false));
  }, []);

  const runAudit = async () => {
    if (!auditCode.trim()) return;
    setAuditing(true);
    setAuditError('');
    setAuditResult(null);
    try {
      const res = await fetch(`${API}/api/devtools/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: auditCode }),
      });
      const data = await res.json();
      if (data.error) { setAuditError(data.error); }
      else { setAuditResult(data); }
    } catch {
      setAuditError('Backend unreachable');
    }
    setAuditing(false);
  };

  const riskColor = (score: number) => score >= 40 ? '#ff3366' : score >= 15 ? '#ffaa00' : '#00ff88';

  const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] -= amount;
    }
}`;

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 className="mono-text text-cyan" style={{ fontSize: '0.85rem' }}>// AI_DEVTOOLS</h3>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {(['gas', 'audit'] as const).map(tab => (
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
              {tab === 'gas' ? '⛽ GAS' : '🔍 AUDIT'}
            </button>
          ))}
        </div>
      </div>

      {/* GAS TAB */}
      {activeTab === 'gas' && (
        <>
          {gasLoading && <p className="mono-text text-muted" style={{ fontSize: '0.75rem' }}>Fetching gas prices...</p>}
          {gasData && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>GAS PRICE</div>
                  <div className="mono-text text-cyan" style={{ fontSize: '0.9rem', fontWeight: 700 }}>{gasData.gas_price_gwei} Gwei</div>
                </div>
                <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>MNT/USD</div>
                  <div className="mono-text" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00ff88' }}>${gasData.mnt_usd}</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '0.4rem 0.6rem', minWidth: '120px' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>NETWORK</div>
                  <div className="mono-text" style={{ fontSize: '0.75rem', color: '#ffaa00' }}>{gasData.network}</div>
                </div>
              </div>
              <p className="mono-text text-muted" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>{gasData.note}</p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th className="mono-text text-muted" style={{ textAlign: 'left', padding: '0.2rem 0.3rem', fontWeight: 400 }}>OPERATION</th>
                      <th className="mono-text text-muted" style={{ textAlign: 'right', padding: '0.2rem 0.3rem', fontWeight: 400 }}>GAS</th>
                      <th className="mono-text text-muted" style={{ textAlign: 'right', padding: '0.2rem 0.3rem', fontWeight: 400 }}>MNT</th>
                      <th className="mono-text text-muted" style={{ textAlign: 'right', padding: '0.2rem 0.3rem', fontWeight: 400 }}>USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(gasData.operations).map(([op, info]) => (
                      <tr key={op} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="mono-text" style={{ padding: '0.25rem 0.3rem', color: '#ccc' }}>{op}</td>
                        <td className="mono-text" style={{ padding: '0.25rem 0.3rem', textAlign: 'right', color: '#888' }}>{info.gas_units.toLocaleString()}</td>
                        <td className="mono-text" style={{ padding: '0.25rem 0.3rem', textAlign: 'right', color: '#00d4ff' }}>{info.cost_mnt.toFixed(6)}</td>
                        <td className="mono-text" style={{ padding: '0.25rem 0.3rem', textAlign: 'right', color: '#00ff88' }}>${info.cost_usd.toFixed(5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* AUDIT TAB */}
      {activeTab === 'audit' && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span className="mono-text text-muted" style={{ fontSize: '0.7rem' }}>Paste Solidity contract:</span>
              <button
                className="neon-btn"
                style={{ fontSize: '0.65rem' }}
                onClick={() => setAuditCode(EXAMPLE_CONTRACT)}
              >
                Load Example
              </button>
            </div>
            <textarea
              value={auditCode}
              onChange={e => setAuditCode(e.target.value)}
              placeholder="// pragma solidity ^0.8.20;"
              style={{
                width: '100%',
                height: '110px',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: '4px',
                color: '#ccc',
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                padding: '0.5rem',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            className="neon-btn"
            onClick={runAudit}
            disabled={auditing || !auditCode.trim()}
            style={{ width: '100%', marginBottom: '0.75rem' }}
          >
            {auditing ? 'ANALYZING WITH AI...' : '🔍 RUN AI AUDIT'}
          </button>

          {auditError && <p style={{ color: '#ff3366', fontSize: '0.75rem' }}>{auditError}</p>}

          {auditResult && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${riskColor(auditResult.risk_score)}44`, borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>RISK SCORE</div>
                  <div className="mono-text" style={{ fontSize: '1.1rem', fontWeight: 700, color: riskColor(auditResult.risk_score) }}>{auditResult.risk_score}/100</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${VERDICT_COLOR[auditResult.overall_verdict]}44`, borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.6rem' }}>VERDICT</div>
                  <div className="mono-text" style={{ fontSize: '0.9rem', fontWeight: 700, color: VERDICT_COLOR[auditResult.overall_verdict] }}>{auditResult.overall_verdict}</div>
                </div>
              </div>
              <p className="mono-text text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.6rem' }}>{auditResult.summary}</p>

              {auditResult.issues.length > 0 && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {auditResult.issues.map((issue, i) => (
                    <div
                      key={i}
                      style={{
                        borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}`,
                        background: `${SEVERITY_COLOR[issue.severity]}0a`,
                        borderRadius: '4px',
                        padding: '0.4rem 0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                        <span className="mono-text" style={{ fontSize: '0.6rem', color: SEVERITY_COLOR[issue.severity], textTransform: 'uppercase' }}>{issue.severity}</span>
                        <span className="mono-text" style={{ fontSize: '0.75rem', color: '#eee', fontWeight: 600 }}>{issue.title}</span>
                      </div>
                      <p className="mono-text" style={{ fontSize: '0.68rem', color: '#aaa', margin: '0 0 0.15rem' }}>{issue.description}</p>
                      <p className="mono-text" style={{ fontSize: '0.68rem', color: '#00ff88', margin: 0 }}>→ {issue.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}

              {auditResult.mantle_specific.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div className="mono-text text-muted" style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}>MANTLE L2 NOTES:</div>
                  {auditResult.mantle_specific.map((note, i) => (
                    <p key={i} className="mono-text" style={{ fontSize: '0.68rem', color: '#00d4ff', margin: '0.1rem 0' }}>• {note}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
