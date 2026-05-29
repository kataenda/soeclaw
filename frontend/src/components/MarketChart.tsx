import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, BarSeries, AreaSeries, BaselineSeries } from 'lightweight-charts';
import type { Prices } from '../App';
import { useTranslation } from '../i18n/TranslationContext';
import { API_URL } from '../config';

interface PricePoint { time: string; price: number }
interface OHLCPoint  { time: number; label: string; open: number; close: number; high: number; low: number; volume: number }
interface Props       { prices: Prices; bybitConnected?: boolean }

type Timeframe   = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
type ChartStyle  = 'bars' | 'candles' | 'hollow' | 'heikin_ashi' | 'line' | 'area' | 'baseline';

const CHART_STYLES: { id: ChartStyle; icon: string; label: string }[] = [
  { id: 'bars',        icon: '↕',  label: 'Bars'           },
  { id: 'candles',     icon: '▮▯', label: 'Candles'        },
  { id: 'hollow',      icon: '▯▮', label: 'Hollow candles' },
  { id: 'heikin_ashi', icon: '▬▬', label: 'Heikin Ashi'   },
  { id: 'line',        icon: '∿',  label: 'Line'           },
  { id: 'area',        icon: '◿',  label: 'Area'           },
  { id: 'baseline',    icon: '⚌',  label: 'Baseline'       },
];

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

const TF_CONFIG: Record<Timeframe, { interval: number; vol: number }> = {
  '1m':  { interval: 1,    vol: 0.0007 },
  '5m':  { interval: 5,    vol: 0.001  },
  '15m': { interval: 15,   vol: 0.0013 },
  '1h':  { interval: 60,   vol: 0.0022 },
  '4h':  { interval: 240,  vol: 0.004  },
  '1D':  { interval: 1440, vol: 0.009  },
};

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'MNT/USDT', 'mETH/USDT', 'COOK/USDT', 'FBTC/USDT', 'WMNT/USDT'] as const;

const BYBIT_INTERVAL: Record<Timeframe, string> = {
  '1m':  '1',
  '5m':  '5',
  '15m': '15',
  '1h':  '60',
  '4h':  '240',
  '1D':  'D',
};

const TICKER_STABLE = [
  { sym: 'USDT', price: 1.0000, chg: 0.00 },
  { sym: 'USDC', price: 1.0001, chg: 0.00 },
];

const DRAW_TOOLS = [
  { icon: '⊹', title: 'Crosshair' },
  { icon: '╱', title: 'Trend Line' },
  { icon: '═', title: 'Horizontal Line' },
  { icon: '⫠', title: 'Parallel Channel' },
  { icon: '▭', title: 'Rectangle' },
  { icon: '○', title: 'Circle' },
  { icon: '✎', title: 'Annotation' },
  { icon: 'T', title: 'Text Label' },
  { icon: '⊕', title: 'Measure' },
  { icon: '🔍', title: 'Zoom Region' },
];

// ── SVG Token Logos ────────────────────────────────────────────────────────────

const BTC_PATH = "M22.4 14.1c.32-2.08-1.28-3.2-3.46-3.94l.71-2.83-1.73-.43-.69 2.75c-.45-.11-.92-.22-1.38-.32l.7-2.78-1.73-.43-.71 2.83-.88-.22-2.38-.59-.46 1.85s1.28.29 1.25.31c.7.17.82.63.8 1l-1.93 7.74c-.14.34-.48.85-1.27.66 0 .03-1.25-.31-1.25-.31l-.86 1.98 2.25.56.86.21-.72 2.88 1.72.43.72-2.88c.47.13.93.25 1.38.36l-.72 2.86 1.73.43.72-2.87c3.15.6 5.52.36 6.52-2.49.8-2.29-.04-3.61-1.7-4.47 1.21-.28 2.12-1.08 2.36-2.73zm-4.22 5.93c-.57 2.28-4.41 1.05-5.65.74l1.01-4.04c1.24.31 5.23.94 4.64 3.3zm.56-5.94c-.52 2.07-3.71 1.02-4.75.76l.92-3.67c1.04.26 4.39.74 3.83 2.91z";
const MNT_PATH = "M7.5 22.5V10l3 5 5.5-7.5 5.5 7.5 3-5v12.5h-2.4V16l-1 1.6-2.4-3.4L16 19.5l-3.2-5.3-2.4 3.4-1-1.6v6.5z";

const TokenLogo: React.FC<{ symbol: string; size?: number }> = ({ symbol, size = 22 }) => {
  const sym = symbol.replace('/USDT', '');

  if (sym === 'BTC') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <radialGradient id="tl-btc" cx="38%" cy="30%" r="68%">
          <stop offset="0%" stopColor="#FFB84D"/>
          <stop offset="100%" stopColor="#C96A00"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-btc)"/>
      <path fill="white" d={BTC_PATH}/>
    </svg>
  );

  if (sym === 'ETH') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="tl-eth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#8BA4F5"/>
          <stop offset="100%" stopColor="#3255CC"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-eth)"/>
      <g transform="translate(16,16)">
        <polygon points="0,-9.5 -5.5,0.5 0,-2.5" fill="white" opacity="0.55"/>
        <polygon points="0,-9.5 5.5,0.5 0,-2.5" fill="white"/>
        <polygon points="0,-2.5 -5.5,0.5 0,4"   fill="white" opacity="0.55"/>
        <polygon points="0,-2.5 5.5,0.5 0,4"     fill="white"/>
        <polygon points="0,4 -5.5,2 0,9.5"       fill="white" opacity="0.55"/>
        <polygon points="0,4 5.5,2 0,9.5"         fill="white"/>
      </g>
    </svg>
  );

  if (sym === 'MNT') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="tl-mnt" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#111c36"/>
          <stop offset="100%" stopColor="#070d1a"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-mnt)"/>
      <circle cx="16" cy="16" r="14" fill="none" stroke="#00D4FF" strokeWidth="0.75" opacity="0.35"/>
      <path fill="#00D4FF" d={MNT_PATH}/>
    </svg>
  );

  if (sym === 'mETH') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="tl-meth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#1e3560"/>
          <stop offset="100%" stopColor="#0b1628"/>
        </linearGradient>
        <linearGradient id="tl-meth2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#111c36"/>
          <stop offset="100%" stopColor="#070d1a"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-meth)"/>
      <g transform="translate(14.5,15.5) scale(0.78)">
        <polygon points="0,-10 -5.5,0.5 0,-2.5" fill="#7aa3f7" opacity="0.55"/>
        <polygon points="0,-10 5.5,0.5 0,-2.5"  fill="#9dbdff"/>
        <polygon points="0,-2.5 -5.5,0.5 0,4"   fill="#7aa3f7" opacity="0.55"/>
        <polygon points="0,-2.5 5.5,0.5 0,4"    fill="#9dbdff"/>
        <polygon points="0,4 -5.5,2 0,9.5"      fill="#7aa3f7" opacity="0.55"/>
        <polygon points="0,4 5.5,2 0,9.5"        fill="#9dbdff"/>
      </g>
      <circle cx="23.5" cy="23.5" r="6.5" fill="url(#tl-meth2)"/>
      <circle cx="23.5" cy="23.5" r="5.8" fill="none" stroke="#00D4FF" strokeWidth="0.8" opacity="0.6"/>
      <text x="23.5" y="26.6" textAnchor="middle" fill="#00D4FF" fontSize="6" fontWeight="900" fontFamily="Arial,sans-serif">m</text>
    </svg>
  );

  if (sym === 'COOK') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <radialGradient id="tl-cook" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#d8b4fe"/>
          <stop offset="100%" stopColor="#6d28d9"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-cook)"/>
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="white" strokeWidth="1.5" opacity="0.35"/>
      <circle cx="16" cy="16" r="4.5" fill="white" opacity="0.9"/>
      <circle cx="16" cy="7"   r="2.8" fill="white"/>
      <circle cx="16" cy="25"  r="2.8" fill="white"/>
      <circle cx="7"  cy="16"  r="2.8" fill="white"/>
      <circle cx="25" cy="16"  r="2.8" fill="white"/>
    </svg>
  );

  if (sym === 'FBTC') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="tl-fbtc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD000"/>
          <stop offset="100%" stopColor="#E05000"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-fbtc)"/>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      <g transform="translate(16,16) scale(0.74) translate(-16,-16)">
        <path fill="white" d={BTC_PATH}/>
      </g>
    </svg>
  );

  if (sym === 'WMNT') return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="tl-wmnt" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a3060"/>
          <stop offset="100%" stopColor="#080f20"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tl-wmnt)"/>
      <circle cx="16" cy="16" r="13.8" fill="none" stroke="#00D4FF" strokeWidth="1" strokeDasharray="2.2,1.4" opacity="0.6"/>
      <path fill="#00D4FF" opacity="0.85" d={MNT_PATH}/>
      <circle cx="24" cy="8.5" r="5.5" fill="#080f20"/>
      <circle cx="24" cy="8.5" r="4.8" fill="none" stroke="#00D4FF" strokeWidth="0.8" opacity="0.55"/>
      <text x="24" y="11.3" textAnchor="middle" fill="#00D4FF" fontSize="5.5" fontWeight="900" fontFamily="Arial,sans-serif">W</text>
    </svg>
  );

  // Generic with gradient
  const GRAD: Record<string, [string, string]> = {
    USDT:['#26A17B','#157a57'], USDC:['#5AABFF','#2775CA'],
    SOL: ['#c084fc','#9945FF'], BNB: ['#FFD75E','#D4950F'],
    LINK:['#6BAEE8','#2A5ADA'], OP:  ['#FF6B6B','#FF0420'],
    ARB: ['#6AD3FF','#12AAFF'], AVAX:['#FF7B7B','#E84142'],
    DOT: ['#FF6ECC','#E6007A'], MATIC:['#B580FF','#8247E5'],
    CLEO:['#00EFFF','#00A8C6'], AUSD:['#FFE97A','#C49800'],
    USDe:['#A5B4FC','#6366F1'], KelpDAO:['#4ADE80','#16A34A'],
    LEND:['#FFA07A','#FF5252'], PENDLE:['#93C5FD','#3B82F6'],
  };
  const [c1, c2] = GRAD[sym] ?? ['#888', '#444'];
  const fs = sym.length <= 2 ? '10' : sym.length <= 3 ? '9' : sym.length <= 4 ? '7.5' : '6';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id={`tl-${sym}`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor={c1}/>
          <stop offset="100%" stopColor={c2}/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#tl-${sym})`}/>
      <text x="16" y="20" textAnchor="middle" fill="white" fontSize={fs} fontWeight="700" fontFamily="Arial,sans-serif">{sym.slice(0, 4)}</text>
    </svg>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcMA(candles: OHLCPoint[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    return candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0) / period;
  });
}

function toHeikinAshi(candles: OHLCPoint[]): OHLCPoint[] {
  const out: OHLCPoint[] = [];
  candles.forEach((c, i) => {
    const prev = out[i - 1];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen  = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({ ...c, open: +haOpen.toFixed(2), close: +haClose.toFixed(2), high: +Math.max(c.high, haOpen, haClose).toFixed(2), low: +Math.min(c.low, haOpen, haClose).toFixed(2) });
  });
  return out;
}

function calcBB(candles: OHLCPoint[], period = 20, mult = 2): { upper: (number|null)[]; lower: (number|null)[] } {
  const upper: (number|null)[] = [];
  const lower: (number|null)[] = [];
  candles.forEach((_, i) => {
    if (i < period - 1) { upper.push(null); lower.push(null); return; }
    const slice = candles.slice(i - period + 1, i + 1).map(c => c.close);
    const mean  = slice.reduce((s, v) => s + v, 0) / period;
    const sd    = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
  });
  return { upper, lower };
}

function generateCandles(history: PricePoint[]): OHLCPoint[] {
  const SIZE = 5;
  const out: OHLCPoint[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i + SIZE <= history.length; i += SIZE) {
    const s  = history.slice(i, i + SIZE);
    const ps = s.map(p => p.price);
    const op = ps[0]; const cl = ps[ps.length - 1];
    const ts = now - (history.length - i) * 5;
    out.push({ time: ts, label: s[2].time, open: op, close: cl, high: Math.max(...ps), low: Math.min(...ps), volume: +(Math.abs(cl - op) / (op || 1) * 1e6 * (0.4 + Math.random() * 0.8)).toFixed(0) });
  }
  return out;
}

function buildCandleHistory(currentPrice: number, change24h: number, realCandles: OHLCPoint[], tf: Timeframe, target = 80): OHLCPoint[] {
  if (currentPrice <= 0) return realCandles;
  const needed = Math.max(0, target - realCandles.length);
  if (needed === 0) return realCandles.slice(-target);
  const { interval, vol } = TF_CONFIG[tf];
  const intervalSec = interval * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  // Align to the same grid as the live-tick candleTime so the last simulated
  // candle and the first live update share the same timestamp (no gap/jump).
  const latestCandleTime = Math.floor(nowSec / intervalSec) * intervalSec;

  const anchor = realCandles[0]?.open ?? currentPrice;
  const start  = anchor / (1 + change24h / 100);
  const trend  = (anchor - start) / (needed || 1);
  let price = start;
  const sim: OHLCPoint[] = [];
  for (let i = 0; i < needed; i++) {
    const open  = price + (Math.random() - 0.5) * currentPrice * vol * 0.3;
    const close = open + trend + (Math.random() - 0.47) * currentPrice * vol;
    const high  = Math.max(open, close) + Math.random() * currentPrice * vol * 0.4;
    const low   = Math.min(open, close) - Math.random() * currentPrice * vol * 0.4;
    // i === needed-1 gets latestCandleTime so live tick matches exactly
    const ts    = latestCandleTime - (needed - 1 - i) * intervalSec;
    sim.push({ time: ts, label: '', open: +open.toFixed(2), close: +close.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), volume: +(Math.abs(close-open)/Math.abs(open||1)*1e6*(0.3+Math.random())).toFixed(0) });
    price = close;
  }
  // Pin the last simulated candle's close to exactly currentPrice so the
  // chart price indicator is always in sync with the header price on load.
  if (sim.length > 0) {
    const tip = sim[sim.length - 1];
    tip.close = currentPrice;
    tip.high  = Math.max(tip.open, tip.high, currentPrice);
    tip.low   = Math.min(tip.open, tip.low,  currentPrice);
  }
  const all = [...sim, ...realCandles];
  const seen = new Set<number>();
  return all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; }).sort((a,b) => a.time - b.time);
}

// ── Ticker Marquee ─────────────────────────────────────────────────────────────

const TickerMarquee: React.FC<{ prices: Prices }> = ({ prices }) => {
  const fmt = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  };

  const items = [
    ...SYMBOLS.map(sym => ({
      sym: sym.replace('/USDT', ''),
      price: prices[sym]?.price ?? 0,
      chg: prices[sym]?.change_24h ?? 0,
    })),
    ...TICKER_STABLE,
  ];

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', height: 30, flexShrink: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', position: 'relative' }}>
      <style>{`
        @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track { display:flex; animation: tickerScroll 48s linear infinite; width:max-content; will-change:transform; }
        .ticker-track:hover { animation-play-state:paused; }
        .ticker-item { display:flex; align-items:center; gap:5px; padding:0 14px; border-right:1px solid rgba(255,255,255,0.04); cursor:default; }
        .ticker-item:hover { background:rgba(255,255,255,0.03); }
      `}</style>
      <div className="ticker-track">
        {[...items, ...items].map((item, i) => (
          <div key={i} className="ticker-item">
            <TokenLogo symbol={item.sym} size={14} />
            <span style={{ fontSize: '0.66rem', color: '#c0c0c0', fontFamily: 'JetBrains Mono,monospace', fontWeight: 600 }}>{item.sym}</span>
            <span style={{ fontSize: '0.66rem', color: '#888', fontFamily: 'JetBrains Mono,monospace' }}>${fmt(item.price)}</span>
            <span style={{ fontSize: '0.62rem', color: item.chg >= 0 ? '#26a69a' : '#ef5350', fontFamily: 'JetBrains Mono,monospace' }}>
              {item.chg >= 0 ? '▲' : '▼'} {Math.abs(item.chg).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Candlestick Chart ─────────────────────────────────────────────────────────

interface CandleProps {
  data: OHLCPoint[];
  currentPrice: number;
  change24h: number;
  prices: Prices;
  selected: string;
  onSelected: (s: string) => void;
  bybitConnected: boolean;
  hasRealData: boolean;
  formatPrice: (p: number) => string;
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
}

const CandlestickChart: React.FC<CandleProps> = ({
  data, currentPrice, change24h, prices, selected, onSelected,
  bybitConnected, hasRealData, formatPrice, timeframe, onTimeframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<ReturnType<typeof createChart> | null>(null);
  const candleRef    = useRef<any>(null);
  const volumeRef    = useRef<any>(null);
  const ma5Ref        = useRef<any>(null);
  const ma20Ref       = useRef<any>(null);
  const lastCandleRef = useRef<OHLCPoint | null>(null);

  type OHLCHover = { open: number; high: number; low: number; close: number; volume: number } | null;
  const [hover, setHover]                 = useState<OHLCHover>(null);
  const [activeToolIdx, setActiveToolIdx] = useState(0);
  const [showMA, setShowMA]               = useState(true);
  const [chartStyle, setChartStyle]       = useState<ChartStyle>('candles');
  const [styleOpen, setStyleOpen]         = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth  || 600,
      height: containerRef.current.clientHeight || 400,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e1a' },
        textColor: '#6b7fa3',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(100,120,180,0.06)' },
        horzLines: { color: 'rgba(100,120,180,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,212,255,0.3)', labelBackgroundColor: '#1a2035' },
        horzLine: { color: 'rgba(0,212,255,0.3)', labelBackgroundColor: '#1a2035' },
      },
      rightPriceScale: {
        borderColor: 'rgba(100,120,180,0.1)',
        textColor: '#4a5a7a',
        scaleMargins: { top: 0.06, bottom: 0.22 },
      },
      timeScale: {
        borderColor: 'rgba(100,120,180,0.1)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    // Create main series based on chartStyle
    if (chartStyle === 'bars') {
      candleRef.current = chart.addSeries(BarSeries, { upColor: '#26a69a', downColor: '#ef5350' });
    } else if (chartStyle === 'hollow') {
      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor: 'transparent', downColor: 'transparent',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
    } else if (chartStyle === 'heikin_ashi') {
      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
    } else if (chartStyle === 'line') {
      candleRef.current = chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 });
    } else if (chartStyle === 'area') {
      candleRef.current = chart.addSeries(AreaSeries, {
        topColor: 'rgba(38,166,154,0.4)', bottomColor: 'rgba(38,166,154,0)',
        lineColor: '#26a69a', lineWidth: 2,
      });
    } else if (chartStyle === 'baseline') {
      candleRef.current = chart.addSeries(BaselineSeries, {
        topLineColor: '#26a69a', bottomLineColor: '#ef5350',
        topFillColor1: 'rgba(38,166,154,0.3)', topFillColor2: 'rgba(38,166,154,0.0)',
        bottomFillColor1: 'rgba(239,83,80,0.0)', bottomFillColor2: 'rgba(239,83,80,0.3)',
      });
    } else {
      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
    }

    const volume = chart.addSeries(HistogramSeries, {
      color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeRef.current = volume;

    // MA lines
    ma5Ref.current  = chart.addSeries(LineSeries, { color: '#f7a600', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma20Ref.current = chart.addSeries(LineSeries, { color: '#7b68ee', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.seriesData.size) { setHover(null); return; }
      const c = param.seriesData.get(candleRef.current) as any;
      const v = param.seriesData.get(volume) as any;
      if (c) setHover({ open: c.open ?? c.value, high: c.high ?? c.value, low: c.low ?? c.value, close: c.close ?? c.value, volume: v?.value ?? 0 });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; lastCandleRef.current = null; };
  }, [chartStyle]); // recreate chart when style changes

  // Full data load — only when the candle dataset changes (TF switch / initial load)
  useEffect(() => {
    if (!candleRef.current || !chartRef.current || data.length === 0) return;
    try {
      const isOHLC   = ['bars','candles','hollow','heikin_ashi'].includes(chartStyle);
      const isSingle = ['line','area','baseline'].includes(chartStyle);
      const sorted   = [...data].sort((a, b) => a.time - b.time);
      lastCandleRef.current = sorted[sorted.length - 1] ?? null;
      const srcCandles = chartStyle === 'heikin_ashi' ? toHeikinAshi(sorted) : sorted;

      if (isOHLC) {
        candleRef.current.setData(srcCandles.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
      } else if (isSingle) {
        candleRef.current.setData(sorted.map(d => ({ time: d.time, value: d.close })));
      }

      volumeRef.current?.setData(
        sorted.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' }))
      );

      const toMA = (vals: (number|null)[]) =>
        sorted.reduce<{time:number; value:number}[]>((acc, d, i) => {
          if (vals[i] !== null) acc.push({ time: d.time, value: vals[i] as number });
          return acc;
        }, []);

      ma5Ref.current?.setData(showMA ? toMA(calcMA(sorted, 5))  : []);
      ma20Ref.current?.setData(showMA ? toMA(calcMA(sorted, 20)) : []);
      chartRef.current.timeScale().scrollToRealTime();

      // Immediately snap price line to real price so it never shows a stale
      // simulation close after setData (before the first live tick fires).
      if (currentPrice > 0 && lastCandleRef.current) {
        const snapLast = lastCandleRef.current;
        const intSec   = TF_CONFIG[timeframe].interval * 60;
        const snapTime = Math.floor(Date.now() / 1000 / intSec) * intSec;
        const snapIsCur = snapTime === snapLast.time;
        try {
          if (isOHLC) {
            candleRef.current.update({ time: snapTime, open: snapIsCur ? snapLast.open : currentPrice, high: snapIsCur ? Math.max(snapLast.high, currentPrice) : currentPrice, low: snapIsCur ? Math.min(snapLast.low, currentPrice) : currentPrice, close: currentPrice });
          } else if (isSingle) {
            candleRef.current.update({ time: snapTime, value: currentPrice });
          }
          lastCandleRef.current = { ...snapLast, time: snapTime, close: currentPrice, high: snapIsCur ? Math.max(snapLast.high, currentPrice) : currentPrice, low: snapIsCur ? Math.min(snapLast.low, currentPrice) : currentPrice };
        } catch (_) {}
      }
    } catch (_) {}
  }, [data, chartStyle, showMA]);

  // Live tick — skip when real Bybit data is available (avoids CoinGecko price mismatch spikes)
  useEffect(() => {
    if (!candleRef.current || !chartRef.current || currentPrice <= 0 || hasRealData) return;
    try {
      const last = lastCandleRef.current;
      if (!last) return;
      const isOHLC   = ['bars','candles','hollow','heikin_ashi'].includes(chartStyle);
      const isSingle = ['line','area','baseline'].includes(chartStyle);
      const intervalSec = TF_CONFIG[timeframe].interval * 60;
      const now         = Math.floor(Date.now() / 1000);
      const candleTime  = Math.floor(now / intervalSec) * intervalSec;
      const isCur = candleTime === last.time;
      const nextOpen  = isCur ? last.open  : currentPrice;
      const nextHigh  = isCur ? Math.max(last.high, currentPrice) : currentPrice;
      const nextLow   = isCur ? Math.min(last.low,  currentPrice) : currentPrice;
      if (isOHLC) {
        candleRef.current.update({ time: candleTime, open: nextOpen, high: nextHigh, low: nextLow, close: currentPrice });
      } else if (isSingle) {
        candleRef.current.update({ time: candleTime, value: currentPrice });
      }
      volumeRef.current?.update({ time: candleTime, value: last.volume, color: currentPrice >= nextOpen ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' });
      chartRef.current.timeScale().scrollToRealTime();
      // Keep lastCandleRef current so next tick's isCur check stays accurate
      lastCandleRef.current = { ...last, time: candleTime, open: nextOpen, high: nextHigh, low: nextLow, close: currentPrice };
    } catch (_) {}
  }, [currentPrice, timeframe, chartStyle]);

  const ma5v  = useMemo(() => { const s=[...data].sort((a,b)=>a.time-b.time); const v=calcMA(s,5);  for(let i=v.length-1;i>=0;i--) if(v[i]!==null) return v[i] as number; return null; }, [data]);
  const ma20v = useMemo(() => { const s=[...data].sort((a,b)=>a.time-b.time); const v=calcMA(s,20); for(let i=v.length-1;i>=0;i--) if(v[i]!==null) return v[i] as number; return null; }, [data]);

  const displayOHLC = hover ?? (data.length ? (() => { const d=[...data].sort((a,b)=>a.time-b.time).at(-1)!; return { open:d.open, high:d.high, low:d.low, close:currentPrice||d.close, volume:d.volume }; })() : null);
  const ohlcColor = displayOHLC ? (displayOHLC.close >= displayOHLC.open ? '#26a69a' : '#ef5350') : '#888';
  const chgColor  = change24h >= 0 ? '#26a69a' : '#ef5350';

  const mcap = useMemo(() => {
    if (currentPrice <= 0) return '—';
    const supply = selected === 'BTC/USDT' || selected === 'FBTC/USDT' ? 19_700_000
      : selected === 'ETH/USDT' || selected === 'mETH/USDT' ? 120_000_000
      : selected === 'COOK/USDT' ? 10_000_000_000
      : 3_200_000_000;
    const cap = currentPrice * supply;
    return cap >= 1e12 ? `$${(cap/1e12).toFixed(2)}T` : cap >= 1e9 ? `$${(cap/1e9).toFixed(2)}B` : `$${(cap/1e6).toFixed(0)}M`;
  }, [currentPrice, selected]);

  const vol24h = useMemo(() => {
    if (bybitCandles.length === 0) return '—';
    const totalVol = bybitCandles.slice(-24).reduce((s, c) => s + c.volume, 0);
    const volUsd = totalVol * currentPrice;
    if (volUsd <= 0) return '—';
    return volUsd >= 1e9 ? `$${(volUsd/1e9).toFixed(2)}B` : volUsd >= 1e6 ? `$${(volUsd/1e6).toFixed(2)}M` : `$${(volUsd/1e3).toFixed(0)}K`;
  }, [bybitCandles, currentPrice]);

  const symName = selected.replace('/USDT', '');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0b0e1a', overflow:'hidden' }}>

      {/* ── Ticker ── */}
      <TickerMarquee prices={prices} />

      {/* ── Token header ── */}
      <div style={{ display:'flex', alignItems:'center', padding:'8px 14px', borderBottom:'1px solid rgba(100,120,180,0.1)', gap:10, flexShrink:0, flexWrap:'wrap', background:'rgba(0,0,0,0.2)' }}>

        {/* Logo + symbol tabs */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ position:'relative' }}>
            <TokenLogo symbol={selected} size={28} />
            {/* live pulse ring */}
            <div style={{ position:'absolute', inset:-2, borderRadius:'50%', border:'1.5px solid rgba(0,212,255,0.4)', animation:'pulseGlow 2s ease-in-out infinite', pointerEvents:'none' }} />
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:'0.8rem', fontWeight:700, color:'#e0e6f0', fontFamily:'JetBrains Mono,monospace', letterSpacing:'-0.3px' }}>{symName}</span>
              <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#26a69a"/><path d="M4 6l1.5 1.5L8 4.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
            </div>
            <div style={{ fontSize:'0.58rem', color:'#3d4f6a', fontFamily:'JetBrains Mono,monospace' }}>Mantle</div>
          </div>
        </div>

        {/* Symbol selector dropdown */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <select
            value={selected}
            onChange={e => onSelected(e.target.value)}
            style={{ appearance:'none', WebkitAppearance:'none', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(0,212,255,0.25)', borderRadius:6, color:'#00d4ff', fontFamily:'JetBrains Mono,monospace', fontSize:'0.72rem', fontWeight:600, padding:'4px 28px 4px 10px', cursor:'pointer', outline:'none' }}
          >
            {SYMBOLS.map(sym => (
              <option key={sym} value={sym} style={{ background:'#0b0e1a', color:'#dde6f0' }}>
                {sym.replace('/USDT', '')} / USDT
              </option>
            ))}
          </select>
          <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#00d4ff', fontSize:'0.6rem', pointerEvents:'none' }}>▼</span>
        </div>

        {/* Live badge */}
        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 7px', background:'rgba(0,232,122,0.06)', border:'1px solid rgba(0,232,122,0.15)', borderRadius:10 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#00e87a', boxShadow:'0 0 6px rgba(0,232,122,0.8)', animation:'pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize:'0.58rem', color:'#00e87a', fontFamily:'JetBrains Mono,monospace', letterSpacing:'0.5px' }}>
            {bybitConnected ? 'BYBIT' : 'LIVE'}
          </span>
        </div>

        {/* Price */}
        <div style={{ display:'flex', alignItems:'baseline', gap:7, marginLeft:6 }}>
          <span style={{ fontSize:'1.3rem', fontWeight:700, color:chgColor, fontFamily:'JetBrains Mono,monospace', letterSpacing:'-1px', textShadow: `0 0 20px ${chgColor}44` }}>
            ${currentPrice > 0 ? formatPrice(currentPrice) : '—'}
          </span>
          <span style={{ fontSize:'0.75rem', color:chgColor, fontFamily:'JetBrains Mono,monospace', fontWeight:600 }}>
            {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
          </span>
        </div>

        <div style={{ flex:1 }} />

        {/* Market stats */}
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          {[
            { label: 'Market Cap', value: mcap,      color: '#d1d9ee' },
            { label: '24H Vol',    value: vol24h,     color: '#d1d9ee' },
            { label: 'Network',    value: 'Mantle',   color: '#00d4ff' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
              <span style={{ fontSize:'0.56rem', color:'#3d4f6a', fontFamily:'JetBrains Mono,monospace', textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</span>
              <span style={{ fontSize:'0.72rem', color: s.color, fontFamily:'JetBrains Mono,monospace', fontWeight:600, marginTop:1 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart area ── */}
      <div style={{ flex:1, display:'flex', minHeight:0 }}>

        {/* Left toolbar */}
        <div style={{ width:38, borderRight:'1px solid rgba(100,120,180,0.07)', display:'flex', flexDirection:'column', alignItems:'center', paddingTop:8, gap:1, flexShrink:0, background:'rgba(0,0,0,0.25)' }}>
          {DRAW_TOOLS.map((tool, i) => (
            <button key={i} title={tool.title} onClick={() => setActiveToolIdx(i)} style={{ width:30, height:26, display:'flex', alignItems:'center', justifyContent:'center', background: activeToolIdx === i ? 'rgba(0,212,255,0.1)' : 'transparent', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.72rem', color: activeToolIdx === i ? '#00d4ff' : '#2d3a50', transition:'all 0.15s', fontFamily:'JetBrains Mono,monospace' }}>
              {tool.icon}
            </button>
          ))}
          <div style={{ flex:1 }} />
          <div style={{ width:24, height:1, background:'rgba(100,120,180,0.1)', margin:'4px 0' }} />
          <button title="Moving Averages" onClick={() => setShowMA(b => !b)} style={{ width:30, height:22, display:'flex', alignItems:'center', justifyContent:'center', background: showMA ? 'rgba(247,166,0,0.12)' : 'transparent', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.55rem', color: showMA ? '#f7a600' : '#2d3a50', transition:'all 0.15s', marginBottom:8 }}>
            MA
          </button>
        </div>

        {/* Main chart column */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* TF tabs + OHLCV + indicators legend */}
          <div style={{ display:'flex', alignItems:'center', padding:'3px 10px', borderBottom:'1px solid rgba(100,120,180,0.07)', flexShrink:0, gap:1, background:'rgba(0,0,0,0.15)', flexWrap:'wrap' }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => onTimeframe(tf)} style={{ fontSize:'0.62rem', padding:'2px 9px', borderRadius:'3px', cursor:'pointer', background: tf === timeframe ? 'rgba(0,212,255,0.1)' : 'transparent', border: tf === timeframe ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent', color: tf === timeframe ? '#00d4ff' : '#3d4f6a', fontFamily:'JetBrains Mono,monospace', fontWeight: tf === timeframe ? 600 : 400, transition:'all 0.15s' }}>
                {tf}
              </button>
            ))}

            {/* Chart style dropdown */}
            <div style={{ position:'relative', marginLeft:4 }}>
              <button onClick={() => setStyleOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.62rem', padding:'2px 8px', borderRadius:3, cursor:'pointer', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(100,120,180,0.15)', color:'#6b7fa3', fontFamily:'JetBrains Mono,monospace', transition:'all 0.15s' }}>
                <span>{CHART_STYLES.find(s => s.id === chartStyle)?.icon}</span>
                <span style={{ fontSize:'0.55rem', color:'#4a5a7a' }}>▾</span>
              </button>
              {styleOpen && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, background:'#0e1220', border:'1px solid rgba(100,120,180,0.2)', borderRadius:6, zIndex:100, minWidth:160, boxShadow:'0 8px 24px rgba(0,0,0,0.6)', overflow:'hidden' }}>
                  {CHART_STYLES.map(s => (
                    <button key={s.id} onClick={() => { setChartStyle(s.id); setStyleOpen(false); }} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'7px 12px', background: chartStyle === s.id ? 'rgba(0,212,255,0.08)' : 'transparent', border:'none', cursor:'pointer', color: chartStyle === s.id ? '#00d4ff' : '#8090b0', fontSize:'0.72rem', fontFamily:'JetBrains Mono,monospace', textAlign:'left', transition:'background 0.12s' }}>
                      <span style={{ fontSize:'0.85rem', width:18, textAlign:'center' }}>{s.icon}</span>
                      <span>{s.label}</span>
                      {chartStyle === s.id && <span style={{ marginLeft:'auto', color:'#00d4ff', fontSize:'0.65rem' }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ width:1, height:12, background:'rgba(100,120,180,0.12)', margin:'0 6px' }} />

            {/* OHLCV */}
            {displayOHLC && (
              <>
                {[['O', formatPrice(displayOHLC.open), ohlcColor], ['H', formatPrice(displayOHLC.high), '#26a69a'], ['L', formatPrice(displayOHLC.low), '#ef5350'], ['C', formatPrice(displayOHLC.close), ohlcColor]].map(([lbl, val, col]) => (
                  <span key={lbl as string} style={{ fontSize:'0.6rem', color:'#2d3a50', marginRight:7, fontFamily:'JetBrains Mono,monospace' }}>
                    {lbl} <span style={{ color: col as string, fontWeight: lbl === 'C' ? 700 : 400 }}>{val}</span>
                  </span>
                ))}
                <span style={{ fontSize:'0.6rem', color:'#2d3a50', marginRight:7 }}>Vol <span style={{ color:'#3d4f6a' }}>{(displayOHLC.volume/1000).toFixed(1)}K</span></span>
                <div style={{ width:1, height:12, background:'rgba(100,120,180,0.12)', margin:'0 6px' }} />
              </>
            )}

            {/* Indicators legend */}
            {showMA && (
              <>
                <span style={{ fontSize:'0.57rem', color:'#f7a600', marginRight:5, fontFamily:'JetBrains Mono,monospace' }}>MA5·{ma5v ? formatPrice(ma5v) : '—'}</span>
                <span style={{ fontSize:'0.57rem', color:'#7b68ee', marginRight:5, fontFamily:'JetBrains Mono,monospace' }}>MA20·{ma20v ? formatPrice(ma20v) : '—'}</span>
              </>
            )}
          </div>

          {/* TradingView chart */}
          <div style={{ flex:1, minHeight:0, position:'relative' }}>
            <div ref={containerRef} style={{ position:'absolute', top:0, left:0, right:0, bottom:0 }} />
            {/* watermark blocker */}
            <div style={{ position:'absolute', bottom:0, left:0, width:80, height:32, background:'#0b0e1a', zIndex:10, pointerEvents:'none' }} />
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const MarketChart: React.FC<Props> = ({ prices, bybitConnected = false }) => {
  useTranslation();
  const [selected,     setSelected]     = useState<string>('BTC/USDT');
  const [history,      setHistory]      = useState<PricePoint[]>([]);
  const [timeframe,    setTimeframe]    = useState<Timeframe>('1h');
  const [seed,         setSeed]         = useState(0);
  const [bybitCandles, setBybitCandles] = useState<OHLCPoint[]>([]);
  const latestPriceRef  = useRef<number>(0);
  const prevSelectedRef = useRef(selected);
  const prevTFRef       = useRef(timeframe);

  const info         = prices[selected] ?? { price: 0, change_24h: 0 };
  const currentPrice = info.price;
  const change24h    = info.change_24h;

  useEffect(() => {
    if (currentPrice <= 0) return;
    latestPriceRef.current = currentPrice;
    const ts = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    if (prevSelectedRef.current !== selected) { prevSelectedRef.current = selected; setHistory([{ time: ts, price: currentPrice }]); }
    else setHistory(prev => [...prev.slice(-49), { time: ts, price: currentPrice }]);
  }, [currentPrice, selected]);

  useEffect(() => {
    const iv = setInterval(() => {
      const p = latestPriceRef.current; if (p <= 0) return;
      const ts = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      setHistory(prev => [...prev.slice(-49), { time: ts, price: p }]);
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (prevTFRef.current !== timeframe) { prevTFRef.current = timeframe; setSeed(s => s + 1); }
  }, [timeframe]);

  // Rebuild base candles when token changes
  useEffect(() => { setSeed(s => s + 1); }, [selected]);

  // Fetch real OHLCV from Bybit; refresh every 60s for live updates
  useEffect(() => {
    const sym      = selected.replace('/', '').toUpperCase();
    const interval = BYBIT_INTERVAL[timeframe];
    const load = () => {
      fetch(`${API_URL}/api/kline?symbol=${sym}&interval=${interval}&limit=200`)
        .then(r => r.json())
        .then(d => {
          if (d.retCode !== 0 || !d.result?.list?.length) return;
          const rows: OHLCPoint[] = [...d.result.list].reverse().map((row: string[]) => ({
            time:   Math.floor(Number(row[0]) / 1000),
            label:  '',
            open:   parseFloat(row[1]),
            high:   parseFloat(row[2]),
            low:    parseFloat(row[3]),
            close:  parseFloat(row[4]),
            volume: parseFloat(row[5]),
          }));
          setBybitCandles(rows);
        })
        .catch(() => {});
    };
    setBybitCandles([]);
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [selected, timeframe]);

  // Trigger initial base build once real price arrives
  const initRef = useRef(false);
  useEffect(() => {
    if (currentPrice > 0 && !initRef.current) { initRef.current = true; setSeed(s => s + 1); }
  }, [currentPrice]);

  // Auto-rebuild baseCandles every 5 min so they don't go stale
  useEffect(() => {
    const iv = setInterval(() => {
      if (latestPriceRef.current > 0) setSeed(s => s + 1);
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // Stable historical base — frozen until timeframe changes (seed only increments on TF switch or init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseCandles = useMemo(() => {
    if (currentPrice <= 0) return [] as OHLCPoint[];
    return buildCandleHistory(currentPrice, change24h, [], timeframe, 195);
  }, [timeframe, seed]);

  const realCandles = useMemo(() => generateCandles(history), [history]);

  const candles = useMemo(() => {
    if (bybitCandles.length > 0) return bybitCandles.slice(-200);
    if (baseCandles.length > 0)  return baseCandles.slice(-200);
    return realCandles.slice(-200);
  }, [bybitCandles, baseCandles, realCandles]);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  };

  return (
    <div className="panel" style={{ flex: 2, minHeight: 0, padding: 0, overflow: 'hidden' }}>
      <CandlestickChart
        data={candles}
        currentPrice={currentPrice}
        change24h={change24h}
        prices={prices}
        selected={selected}
        onSelected={setSelected}
        bybitConnected={bybitConnected}
        hasRealData={bybitCandles.length > 0}
        formatPrice={formatPrice}
        timeframe={timeframe}
        onTimeframe={setTimeframe}
      />
    </div>
  );
};

export default MarketChart;
