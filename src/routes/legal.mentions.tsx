import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/mentions")({
  component: MentionsPage,
  head: () => ({ meta: [{ title: "Legal Notice — BNP PARIBAS" }] }),
});

function MentionsPage() {
  return (
    <LegalLayout title="Legal Notice" updated="2026-06-22">
      <h2>Publisher</h2><p>BNP PARIBAS — SAS with capital of 1,000,000 EUR — registered office: 1 Centenary Square, Birmingham, B1 1HQ, Royaume-Uni. RCS Birmingham 000 000 000.</p>
      <h2>Publication director</h2><p>BNP PARIBAS Compliance Office.</p>
      <h2>Hosting</h2><p>Cloudflare Workers — 101 Townsend St, San Francisco, CA 94107, USA.</p>
      <h2>Contact</h2><p><a href="mailto:info@myinvest-capital.com">infi@hsbc-bank.fr</a></p>
      <h2>Intellectual property</h2><p>All trademarks, logos and content remain the property of BNP PARIBAS or its licensors. Any reproduction without written authorisation is prohibited.</p>
    </LegalLayout>
  );
}
