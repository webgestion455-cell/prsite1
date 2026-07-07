import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/components/chat/chat-helpers";

export const Route = createFileRoute("/admin/chat")({
  component: AdminChatLayout,
  head: () => ({ meta: [{ title: "Admin — Live Chat" }] }),
});

interface Row {
  id: string;
  user_id: string;
  status: string;
  assigned_agent_name: string | null;
  subject: string;
  last_message_at: string;
  unread_agent: number;
}

function AdminChatLayout() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const params = useParams({ strict: false }) as { conversationId?: string };

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from("chat_conversations")
        .select("id,user_id,status,assigned_agent_name,subject,last_message_at,unread_agent")
        .order("last_message_at", { ascending: false })
        .limit(100);
      setRows((data as Row[]) ?? []);
    };
    load();
    const chan = supabase
      .channel("admin-chat-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        () => load(),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(chan);
    };
  }, []);

  const active = params.conversationId;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">💬 Live Chat</h1>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border bg-card overflow-hidden max-h-[75vh] overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{t("chat.admin.empty")}</p>
          )}
          {rows.map((r) => (
            <Link
              key={r.id}
              to="/admin/chat/$conversationId"
              params={{ conversationId: r.id }}
              className={cn(
                "block px-3 py-2.5 border-b border-border text-sm hover:bg-muted transition",
                active === r.id && "bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{r.subject}</span>
                {r.unread_agent > 0 && (
                  <Badge className="bg-emerald-600 text-white text-[10px]">{r.unread_agent}</Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                <span className="capitalize">{t(`chat.status.${r.status}`)}</span>
                <span>{formatDay(r.last_message_at, t as any, i18n.language)}</span>
              </div>
            </Link>
          ))}
        </aside>
        <section className="h-[75vh]">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
