import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
  head: () => ({ meta: [{ title: "Cookies Policy — BNP PARIBAS" }] }),
});

function CookiesPage() {
  return (
    <LegalLayout title="Cookies Policy" updated="2026-06-22">
      <h2>What we use</h2>
      <ul>
        <li><strong>Strictly necessary</strong> — authentication, session, security (no consent required).</li>
        <li><strong>Functional</strong> — language preference, theme.</li>
        <li><strong>Security</strong> — device fingerprinting for fraud detection (legitimate interest).</li>
        <li><strong>Analytics</strong> — aggregated usage, only with consent.</li>
      </ul>
      <h2>Manage your cookies</h2>
      <p>You can clear cookies in your browser settings at any time. Disabling strictly necessary cookies will prevent you from signing in.</p>
    </LegalLayout>
  );
}
