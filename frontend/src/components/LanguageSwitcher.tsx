import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/TranslationContext';
import type { LangCode } from '../i18n/translations';

const LANGS: { code: LangCode; flag: string; label: string }[] = [
  { code: 'en',    flag: '🇺🇸', label: 'EN' },
  { code: 'id',    flag: '🇮🇩', label: 'ID' },
  { code: 'zh-CN', flag: '🇨🇳', label: 'ZH' },
  { code: 'ja',    flag: '🇯🇵', label: 'JA' },
  { code: 'ko',    flag: '🇰🇷', label: 'KO' },
  { code: 'ar',    flag: '🇸🇦', label: 'AR' },
  { code: 'fr',    flag: '🇫🇷', label: 'FR' },
  { code: 'es',    flag: '🇪🇸', label: 'ES' },
];

const LanguageSwitcher = () => {
  const { lang, setLang } = useTranslation();
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ top: 0, left: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const w = 120;
      setPos({
        top:  r.bottom + 6,
        left: Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4)),
      });
    }
    setOpen(o => !o);
  };

  const pick = (code: LangCode) => {
    setLang(code);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = LANGS.find(l => l.code === lang) ?? LANGS[0];

  const dropdown = open ? createPortal(
    <div style={{
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      width: '120px',
      background: '#0a0a14',
      border: '1px solid rgba(0,255,204,0.4)',
      borderRadius: '6px',
      overflow: 'hidden',
      zIndex: 2147483647,
      boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 16px rgba(0,255,204,0.1)',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {LANGS.map(l => (
        <button
          key={l.code}
          onMouseDown={() => pick(l.code)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.45rem 0.75rem',
            background: lang === l.code ? 'rgba(0,255,204,0.12)' : 'transparent',
            border: 'none',
            borderBottom: '1px solid rgba(0,255,204,0.06)',
            color: lang === l.code ? '#00ffcc' : '#94a3b8',
            fontFamily: 'inherit',
            fontSize: '0.72rem',
            cursor: 'pointer',
            letterSpacing: '1px',
          }}
        >
          {l.flag} {l.label}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          background: 'transparent',
          border: '1px solid rgba(0,255,204,0.3)',
          color: '#00ffcc',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.72rem',
          padding: '0.35rem 0.6rem',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          letterSpacing: '1px',
        }}
      >
        {current.flag} {current.label} ▾
      </button>
      {dropdown}
    </>
  );
};

export default LanguageSwitcher;
