import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { ChatWindow, ensureConversation } from "@/components/chat/ChatWindow";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Chat — BNP PARIBAS" }] }),
});

function ChatPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth() as any;
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    ensureConversation(user.id).then((c) => setConversationId(c.id)).catch(console.error);
  }, [user]);

  if (loading) return <div className="p-8 text-center">{t("common.loading")}…</div>;
  if (!user)
    return (
      <div className="p-8 text-center text-muted-foreground">{t("chat.loginRequired.desc")}</div>
    );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">{t("chat.pageTitle")}</h1>
      <p className="text-sm text-muted-foreground mb-4">{t("chat.pageDesc")}</p>
      <div className="h-[calc(100vh-260px)] min-h-[520px]">
        {conversationId ? (
          <ChatWindow conversationId={conversationId} mode="client" />
        ) : (
          <div className="grid h-full place-items-center rounded-2xl border border-border bg-card">
            <p className="text-sm text-muted-foreground">{t("common.loading")}…</p>
          </div>
        )}
      </div>
    </div>
  );
}
