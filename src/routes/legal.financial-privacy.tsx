import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/financial-privacy")({
  component: FinPrivPage,
  head: () => ({ meta: [{ title: "Financial Privacy & Security — BNP PARIBAS" }] }),
});

function FinPrivPage() {
  return (
    <LegalLayout title="Financial Privacy & Security" updated="2026-06-22">
      <h2>Protecting your money</h2>
      <p>We apply bank-grade controls to every account: TLS 1.3 in transit, AES-256 at rest, hardware-backed key management, segregated client funds at top-tier custodian banks.</p>
      <h2>Authentication</h2><p>Strong customer authentication (SCA) compliant with PSD2: password + device fingerprint + one-time code on sensitive actions.</p>
      <h2>Fraud monitoring</h2><p>24/7 anomaly detection: new-device alerts, geo-velocity checks, unusual transfer patterns, behaviour scoring.</p>
      <h2>Confidentiality</h2><p>Bank secrecy applies. Financial data is shared only with you, regulators, or upon a valid court order.</p>
      <h2>Your role</h2><p>Keep your credentials private, register trusted devices, enable notifications, and report anything suspicious to support immediately.</p>
    </LegalLayout>
  );
}
