import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus, ChevronLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CenterLoader, ListSkeleton } from "@/components/ui/loader";
import {
  ChatWindow,
  ensureConversation,
  type ChatConversation,
} from "@/components/chat/ChatWindow";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "Assistance en ligne — BNP PARIBAS" },
      {
        name: "description",
        content:
          "Espace d'assistance BNP PARIBAS : échangez avec votre conseiller, suivez vos tickets ouverts et retrouvez l'historique de vos conversations.",
      },
      { property: "og:title", content: "Assistance en ligne — BNP PARIBAS" },
      {
        property: "og:description",
        content: "Échangez avec un conseiller et suivez vos tickets d'assistance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ChatPage() {
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth() as any;
  const [convs, setConvs] = useState<ChatConversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [busy, setBusy] = useState(false);

  const welcome = useMemo(
    () => ({ greeting: t("chat.welcome.greeting"), help: t("chat.welcome.help") }),
    [t, i18n.language],
  );

  const load = useCallback(
    async (select?: string) => {
      if (!user) return;
      const { data } = await (supabase as any)
        .from("chat_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false });
      const list = (data ?? []) as ChatConversation[];
      setConvs(list);
      if (select) {
        setActiveId(select);
      } else {
        setActiveId((cur) => cur ?? list.find((c) => c.status !== "closed")?.id ?? null);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("chat_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false });
      const list = (data ?? []) as ChatConversation[];
      if (list.length === 0) {
        try {
          const c = await ensureConversation(user.id, welcome);
          setConvs([c]);
          setActiveId(c.id);
          return;
        } catch (e) {
          console.error(e);
        }
      }
      setConvs(list);
      setActiveId(list.find((c) => c.status !== "closed")?.id ?? list[0]?.id ?? null);
    })();
  }, [user, welcome]);

  // Temps réel : les tickets fermés/rouverts restent synchronisés
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-list-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  async function startNew() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const c = await ensureConversation(user.id, welcome, true);
      await load(c.id);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <CenterLoader className="min-h-[60vh]" />;
  if (!user)
    return (
      <div className="p-8 text-center text-muted-foreground">{t("chat.loginRequired.desc")}</div>
    );

  const open = (convs ?? []).filter((c) => c.status !== "closed");
  const closed = (convs ?? []).filter((c) => c.status === "closed");
  const visible = tab === "open" ? open : closed;

  return (
    <div className="container mx-auto max-w-6xl px-3 sm:px-4 py-4 sm:py-6">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl sm:text-2xl font-bold">{t("chat.pageTitle")}</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground line-clamp-2">
            {t("chat.pageDesc")}
          </p>
        </div>
        <Button onClick={startNew} disabled={busy} className="shrink-0" size="sm">
          <MessageSquarePlus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t("chat.tickets.new")}</span>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Liste des tickets */}
        <aside
          className={cn(
            "min-w-0 rounded-2xl border border-border bg-card overflow-hidden",
            activeId ? "hidden lg:block" : "block",
          )}
        >
          <div className="flex border-b border-border">
            {(["open", "closed"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
                  tab === k
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`chat.tickets.${k}`)} ({k === "open" ? open.length : closed.length})
              </button>
            ))}
          </div>

          <div className="max-h-[50vh] lg:max-h-[calc(100vh-260px)] overflow-y-auto">
            {convs === null ? (
              <ListSkeleton rows={4} />
            ) : visible.length === 0 ? (
              <div className="grid place-items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Inbox className="h-6 w-6 opacity-60" />
                {t("chat.tickets.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full text-left px-3 py-3 transition hover:bg-muted/60",
                        activeId === c.id && "bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {c.subject || t("chat.tickets.one")}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            c.status === "closed"
                              ? "bg-muted text-muted-foreground"
                              : "bg-success/15 text-success",
                          )}
                        >
                          {t(`chat.status.${c.status}`)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {c.ticket_number ? `#${c.ticket_number} · ` : ""}
                        {new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(c.last_message_at ?? c.created_at))}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className="min-w-0">
          {activeId && (
            <button
              onClick={() => setActiveId(null)}
              className="lg:hidden mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("chat.tickets.back")}
            </button>
          )}
          <div className="h-[70vh] min-h-[460px] lg:h-[calc(100vh-220px)]">
            {activeId ? (
              <ChatWindow
                key={activeId}
                conversationId={activeId}
                mode="client"
                onCloseTicket={() => void load()}
              />
            ) : (
              <div className="hidden lg:grid h-full place-items-center rounded-2xl border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
                {t("chat.tickets.empty")}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
