import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy Policy — BNP PARIBAS" }, { name: "description", content: "How BNP PARIBAS collects, uses and protects your personal data." }] }),
});

function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" subtitle="Your privacy is a core part of our banking trust commitment." updated="2026-06-22">
      <h2>1. Data we collect</h2>
      <p>Identity (name, date of birth), contact (email, phone, address), financial data (income, IBAN, loan information), technical data (IP, browser, device fingerprint), and behavioural data (sessions, clicks, security events).</p>
      <h2>2. Why we collect it</h2>
      <p>Open and manage your account, evaluate loan applications, prevent fraud and money laundering, meet legal obligations, and improve our services.</p>
      <h2>3. Legal basis (GDPR)</h2>
      <p>Performance of a contract, legitimate interest in fraud prevention, legal obligation (AML/KYC), and your explicit consent for marketing.</p>
      <h2>4. Data sharing</h2>
      <p>Limited to vetted processors (cloud hosting, identity verification, payment networks), regulators and judicial authorities upon legal request.</p>
      <h2>5. Retention</h2>
      <p>Account data: while the relationship is active plus 10 years (AML). Security logs: 24 months. Cookies: as set in our cookie policy.</p>
      <h2>6. Your rights</h2>
      <p>Access, rectification, deletion, restriction, portability, and objection. Contact <a href="mailto:support_bnpparibas@nowelio.com">privacy@bnpparibas.com</a>. You may file a complaint with your national data protection authority.</p>
      <h2>7. Security</h2>
      <p>Encryption in transit (TLS) and at rest, device fingerprinting, anomaly detection, MFA on sensitive actions, and a 24/7 incident response process.</p>
    </LegalLayout>
  );
}
