import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { ChatWindow, ensureConversation } from "./chat/ChatWindow";
import { Link } from "@tanstack/react-router";

export function LiveChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user || conversationId) return;
    setLoading(true);
    ensureConversation(user.id)
      .then((c) => setConversationId(c.id))
      .catch((e) => console.error("chat init", e))
      .finally(() => setLoading(false));
  }, [open, user, conversationId]);

  // Bouton "connectez-vous" quand pas authentifié
  const requiresLogin = !user;

  return (
    <>
      <button
        type="button"
        aria-label={t("livechat.open")}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-40 bottom-20 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-elevated grid place-items-center",
          "bg-[#00915A] text-white hover:scale-105 transition",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Live chat"
          className="fixed z-40 bottom-36 right-4 sm:bottom-24 sm:right-6 w-[min(400px,calc(100vw-2rem))] h-[600px] max-h-[80vh]"
        >
          {requiresLogin ? (
            <div className="h-full flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-elevated">
              <MessageCircle className="h-10 w-10 text-primary mb-3" />
              <p className="font-semibold mb-1">{t("chat.loginRequired.title")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("chat.loginRequired.desc")}</p>
              <Link
                to="/auth"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                {t("chat.loginRequired.cta")}
              </Link>
            </div>
          ) : loading || !conversationId ? (
            <div className="h-full grid place-items-center rounded-2xl border border-border bg-card">
              <p className="text-sm text-muted-foreground">{t("common.loading")}…</p>
            </div>
          ) : (
            <ChatWindow
              conversationId={conversationId}
              mode="client"
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </>
  );
}
