import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: "Terms of Service — BNP PARIBAS" }, { name: "description", content: "The legally binding terms governing your use of BNP PARIBAS services." }] }),
});

function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" subtitle="By using BNP PARIBAS you accept the terms below." updated="2026-06-22">
      <h2>1. Eligibility</h2><p>You must be at least 18, a resident of an eligible country, and able to enter binding contracts.</p>
      <h2>2. Account</h2><p>Provide accurate information, keep credentials confidential, and notify us of any suspected compromise.</p>
      <h2>3. Acceptable use</h2><p>No fraud, money laundering, terrorism financing, market abuse, automated scraping, or any activity prohibited by applicable law.</p>
      <h2>4. Fees</h2><p>Disclosed in-app before each operation. We may update fees with 30 days' notice.</p>
      <h2>5. Liability</h2><p>We are liable for direct losses caused by our gross negligence. We do not cover indirect, consequential or speculative losses.</p>
      <h2>6. Suspension</h2><p>We may suspend access immediately if we suspect fraud, AML risk, or breach of these terms.</p>
      <h2>7. Governing law</h2><p>French law unless mandatory consumer law of your residence applies. Disputes go to the competent French courts subject to consumer protections.</p>
    </LegalLayout>
  );
}
