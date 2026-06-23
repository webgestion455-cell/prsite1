import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X, Send, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { from: "bot" | "user"; text: string };

const STORE_KEY = "bnpparibas.livechat.history";

export function LiveChat() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
      else setMsgs([{ from: "bot", text: t("livechat.greeting") }]);
    } catch {
      setMsgs([{ from: "bot", text: t("livechat.greeting") }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(msgs));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const reply = botReply(text, t);
    setMsgs((m) => [...m, { from: "user", text }, { from: "bot", text: reply }]);
    setDraft("");
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("livechat.open")}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-40 bottom-20 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-elevated grid place-items-center",
          "bg-primary text-primary-foreground hover:scale-105 transition",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("livechat.title")}
          className="fixed z-40 bottom-36 right-4 sm:bottom-24 sm:right-6 w-[min(360px,calc(100vw-2rem))] h-[480px] max-h-[70vh] rounded-2xl border border-border bg-card shadow-elevated flex flex-col overflow-hidden"
        >
          <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold truncate">{t("livechat.title")}</p>
              <p className="text-[11px] opacity-90 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("livechat.online")}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t("livechat.close")}><X className="h-4 w-4" /></button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-background/50">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  m.from === "bot"
                    ? "bg-secondary text-foreground rounded-bl-sm"
                    : "ml-auto bg-primary text-primary-foreground rounded-br-sm",
                )}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-card px-3 py-2 flex items-center gap-2">
            <a
              href="https://wa.me/447529529674"
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition"
              aria-label="WhatsApp"
            >
              <Phone className="h-4 w-4" />
            </a>
            <a
              href="mailto:support_bnpparibas@nowelio.com"
              className="grid h-9 w-9 place-items-center rounded-full bg-muted hover:bg-muted/70 transition"
              aria-label="Email"
            >
              <Mail className="h-4 w-4" />
            </a>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={t("livechat.placeholder")}
              className="flex-1 h-9 rounded-full border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button size="icon" onClick={send} className="h-9 w-9 rounded-full">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function botReply(text: string, t: (k: string) => string): string {
  const q = text.toLowerCase();
  if (/(pr[eê]t|loan|kredit|prestamo|prestito)/.test(q)) return t("livechat.faq.loan");
  if (/(mot de passe|password|passwort|contrase|wachtwoord|geslo|парол)/.test(q)) return t("livechat.faq.password");
  if (/(virement|transfer|überweis|transferencia|bonifico|prevod|превод)/.test(q)) return t("livechat.faq.transfer");
  if (/(contact|email|mail|téléphone|phone)/.test(q)) return t("livechat.faq.contact");
  if (/(merci|thanks|danke|gracias|grazie|hvala|благодар)/.test(q)) return t("livechat.faq.thanks");
  return t("livechat.faq.default");
}
