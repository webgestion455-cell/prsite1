import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import nl from "./locales/nl.json";
import sl from "./locales/sl.json";
import bg from "./locales/bg.json";
import sk from "./locales/sk.json";
import el from "./locales/el.json";
import fi from "./locales/fi.json";
import ro from "./locales/ro.json";
import pl from "./locales/pl.json";
import hr from "./locales/hr.json";
import hu from "./locales/hu.json";

export const SUPPORTED_LANGUAGES = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "sl", label: "Slovenščina", flag: "🇸🇮" },
  { code: "bg", label: "Български", flag: "🇧🇬" },
  { code: "sk", label: "Slovenčina", flag: "🇸🇰" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "fi", label: "Suomi", flag: "🇫🇮" },
  { code: "ro", label: "Română", flag: "🇷🇴" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "hr", label: "Hrvatski", flag: "🇭🇷" },
  { code: "hu", label: "Magyar", flag: "🇭🇺" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as readonly string[];

function pickSupported(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const short = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(short) ? short : null;
}

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        fr: { translation: fr },
        en: { translation: en },
        de: { translation: de },
        es: { translation: es },
        it: { translation: it },
        nl: { translation: nl },
        sl: { translation: sl },
        bg: { translation: bg },
        sk: { translation: sk },
        el: { translation: el },
        fi: { translation: fi },
        ro: { translation: ro },
        pl: { translation: pl },
        hr: { translation: hr },
        hu: { translation: hu },
      },
      lng: undefined,
      fallbackLng: "fr",
      supportedLngs: SUPPORTED_CODES as string[],
      nonExplicitSupportedLngs: true,
      load: "languageOnly",
      initAsync: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag", "path", "subdomain"],
        caches: ["localStorage", "cookie"],
        lookupLocalStorage: "bnpparibas.lang",
      },
    });

  // Keep <html lang> in sync + react automatically when the OS/browser changes language
  if (typeof window !== "undefined") {
    i18n.on("languageChanged", (lng) => {
      const short = lng.split("-")[0];
      try {
        document.documentElement.lang = short;
      } catch {
        /* ignore */
      }
    });

    const handleSystemChange = () => {
      // Only auto-follow system language if the user never explicitly picked one
      try {
        const stored = window.localStorage.getItem("bnpparibas.lang");
        if (stored) return;
      } catch {
        /* ignore */
      }
      const next = pickSupported(window.navigator.language);
      if (next && next !== i18n.resolvedLanguage) {
        void i18n.changeLanguage(next);
      }
    };

    window.addEventListener("languagechange", handleSystemChange);
  }
}

export default i18n;
