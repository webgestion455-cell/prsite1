import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/aml-kyc")({
  component: AmlPage,
  head: () => ({ meta: [{ title: "AML / KYC Policy — BNP PARIBAS" }] }),
});

function AmlPage() {
  return (
    <LegalLayout title="Anti-Money Laundering & KYC Policy" updated="2026-06-22">
      <h2>Commitment</h2><p>BNP PARIBAS applies a zero-tolerance approach to money laundering, terrorism financing and sanctions evasion, in line with EU directives (AMLD5/6), FATF recommendations, and applicable national laws.</p>
      <h2>Customer due diligence</h2><p>Identity verification (government ID + selfie liveness), proof of address, source-of-funds checks, and continuous monitoring of transactions.</p>
      <h2>Enhanced due diligence</h2><p>Applied to politically exposed persons (PEPs), high-risk jurisdictions, and complex or unusual transactions.</p>
      <h2>Sanctions screening</h2><p>Real-time screening against EU, UN, OFAC and UK consolidated lists.</p>
      <h2>Reporting</h2><p>Suspicious activity reports filed with the competent Financial Intelligence Unit. Tipping-off is strictly prohibited.</p>
      <h2>Training & governance</h2><p>All staff receive annual AML/KYC training. An independent MLRO supervises the program.</p>
    </LegalLayout>
  );
}
