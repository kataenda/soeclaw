import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type LangCode, type Dict } from './translations';

interface TranslationContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: keyof Dict) => string;
}

const TranslationContext = createContext<TranslationContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key as string,
});

export const TranslationProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<LangCode>(
    () => (localStorage.getItem('sc_lang') as LangCode | null) ?? 'en'
  );

  const setLang = (newLang: LangCode) => {
    localStorage.setItem('sc_lang', newLang);
    setLangState(newLang);
  };

  const t = (key: keyof Dict): string =>
    (translations[lang]?.[key] ?? translations.en[key] ?? key) as string;

  return (
    <TranslationContext.Provider value={{ lang, setLang, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => useContext(TranslationContext);
