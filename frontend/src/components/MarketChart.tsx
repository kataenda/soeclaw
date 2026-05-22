import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import type { Prices } from '../App';
import { useTranslation } from '../i18n/TranslationContext';

interface PricePoint { time: string; price: number }

interface Props { prices: Prices; bybitConnected?: boolean }

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'MNT/USDT'] as const;

const MarketChart: React.FC<Props> = ({ prices, bybitConnected = false }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>('BTC/USDT');
  const [history, setHistory]   = useState<PricePoint[]>([]);
  const latestPriceRef = useRef<number>(0);

  const info         = prices[selected] ?? { price: 0, change_24h: 0 };
  const currentPrice = info.price;
  const change24h    = info.change_24h;
  const changeColor  = change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-pink, #ff3366)';
  const changeSign   = change24h >= 0 ? '+' : '';

  const prevSelectedRef = useRef(selected);

  useEffect(() => {
    if (currentPrice <= 0) return;
    latestPriceRef.current = currentPrice;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const point = { time: timeStr, price: currentPrice };

    if (prevSelectedRef.current !== selected) {
      prevSelectedRef.current = selected;
      setHistory([point]);
    } else {
      setHistory(prev => [...prev.slice(-49), point]);
    }
  }, [currentPrice, selected]);

  useEffect(() => {
    const interval = setInterval(() => {
      const p = latestPriceRef.current;
      if (p <= 0) return;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistory(prev => [...prev.slice(-49), { time: timeStr, price: p }]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  };

  const yDomain = (() => {
    if (history.length === 0) return ['auto', 'auto'] as const;
    const ps = history.map(h => h.price);
    const min = Math.min(...ps);
    const max = Math.max(...ps);
    const pad = (max - min) * 0.5 || min * 0.001;
    return [min - pad, max + pad] as [number, number];
  })();

  return (
    <div className="panel" style={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 className="mono-text text-cyan" style={{ fontSize: '1rem' }}>{t('chart_title')}</h3>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            {bybitConnected
              ? <span style={{ color: 'var(--accent-green)' }}>{t('chart_source_bybit')}</span>
              : <span>{t('chart_source_coingecko')}</span>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {SYMBOLS.map(sym => (
            <button
              key={sym}
              onClick={() => setSelected(sym)}
              className={selected === sym ? 'neon-btn' : ''}
              style={{
                fontSize: '0.7rem',
                padding: '0.25rem 0.5rem',
                background: selected === sym ? undefined : 'transparent',
                border: selected === sym ? undefined : '1px solid rgba(0,255,204,0.2)',
                color: selected === sym ? undefined : 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              {sym.replace('/USDT', '')}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className="mono-text text-green" style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
            ${currentPrice > 0 ? formatPrice(currentPrice) : '---'}
          </div>
          <div className="mono-text" style={{ fontSize: '0.8rem', color: changeColor }}>
            {currentPrice > 0 ? `${changeSign}${change24h.toFixed(2)}% 24h` : t('chart_loading_price')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {SYMBOLS.map(sym => {
          const p = prices[sym];
          if (!p || p.price === 0) return null;
          const c = p.change_24h;
          return (
            <div key={sym} style={{ fontSize: '0.75rem' }} className="mono-text">
              <span className="text-muted">{sym}: </span>
              <span className="text-cyan">${p.price >= 1000 ? p.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.price.toFixed(4)}</span>
              <span style={{ marginLeft: '4px', color: c >= 0 ? 'var(--accent-green)' : '#ff3366' }}>
                {c >= 0 ? '+' : ''}{c.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
        {history.length >= 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history.length === 1 ? [history[0], { ...history[0], time: '' }] : history} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent-cyan)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
              <YAxis domain={yDomain} stroke="var(--text-muted)" fontSize={10} tickLine={false} width={70} tickFormatter={(v) => formatPrice(Number(v))} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-neon)' }}
                labelStyle={{ color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono' }}
                itemStyle={{ color: 'var(--text-main)' }}
                formatter={(v) => [`$${formatPrice(Number(v))}`, selected]}
              />
              <Area type="monotone" dataKey="price" stroke="var(--accent-cyan)" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }} className="mono-text">
            {t('chart_fetching')}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketChart;
