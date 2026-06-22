import type { Database } from "@/integrations/supabase/types";
import i18n from "@/i18n";

export type LoanStatus = Database["public"]["Enums"]["loan_status"];

// Static defaults (fallback FR). UI components should prefer t(`status.<key>`).
export const STATUS_LABELS: Record<LoanStatus, string> = {
  en_attente: "En attente",
  accepte: "Accepté",
  refuse: "Refusé",
  contrat_envoye: "Contrat envoyé",
  contrat_signe: "Contrat signé",
  en_traitement: "En traitement",
  fonds_disponibles: "Fonds disponibles",
};

export const STATUS_DESCRIPTIONS: Record<LoanStatus, string> = {
  en_attente: "Votre demande est en cours d'examen par notre équipe.",
  accepte: "Bonne nouvelle ! Votre demande a été acceptée.",
  refuse: "Votre demande n'a pas pu être acceptée cette fois-ci.",
  contrat_envoye: "Votre contrat est prêt. Téléchargez, signez et renvoyez-le.",
  contrat_signe: "Contrat signé reçu. Traitement en cours sous 24-72h.",
  en_traitement: "Vos fonds sont en cours de transfert (24-72h).",
  fonds_disponibles: "Vos fonds sont disponibles. Vous pouvez les retirer.",
};

export const STATUS_VARIANTS: Record<LoanStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  en_attente: "warning",
  accepte: "success",
  refuse: "destructive",
  contrat_envoye: "default",
  contrat_signe: "default",
  en_traitement: "warning",
  fonds_disponibles: "success",
};

export const STATUS_PROGRESS: Record<LoanStatus, number> = {
  en_attente: 15,
  accepte: 35,
  refuse: 100,
  contrat_envoye: 50,
  contrat_signe: 70,
  en_traitement: 85,
  fonds_disponibles: 100,
};

/** Translate a status key reactively-safe by reading current i18n language. */
export function tStatus(s: LoanStatus): string {
  const key = `status.${s}`;
  const translated = i18n.t(key);
  return translated === key ? STATUS_LABELS[s] : translated;
}

/** Translate the long-form status description. */
export function tStatusDescription(s: LoanStatus): string {
  const key = `loanDetail.loanDescription.${s}`;
  const translated = i18n.t(key);
  return translated === key ? STATUS_DESCRIPTIONS[s] : translated;
}

function currentLocale(): string {
  const lng = i18n.resolvedLanguage || i18n.language || "fr";
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
    nl: "nl-NL", sl: "sl-SI", bg: "bg-BG", sk: "sk-SK",
  };
  return map[lng] ?? lng;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string) {
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(date));
}
