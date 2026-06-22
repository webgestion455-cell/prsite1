import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/repayment")({
  component: RepaymentPage,
  head: () => ({ meta: [{ title: "Repayment & Default Policy — BNP PARIBAS" }] }),
});

function RepaymentPage() {
  return (
    <LegalLayout title="Repayment & Default Policy" updated="2026-06-22">
      <h2>Repayment schedule</h2><p>Monthly installments are debited on the agreed date from your declared IBAN. The schedule is visible from your dashboard.</p>
      <h2>Early repayment</h2><p>Allowed at any time. Indemnity capped per consumer law (0.5% to 1% of capital repaid early depending on remaining duration).</p>
      <h2>Late payment</h2><ul><li>Day 1–7: friendly reminder, no extra fee.</li><li>Day 8–30: late fee + statutory default interest.</li><li>Day 31+: formal notice and possible acceleration of the loan.</li></ul>
      <h2>Recovery</h2><p>We always prefer an amicable solution. Persistent default may lead to registration with central payment-incident files and judicial recovery.</p>
      <h2>Hardship</h2><p>If you face genuine hardship, contact us immediately. We can offer payment holidays, rescheduling, or temporary reductions where eligible.</p>
    </LegalLayout>
  );
}
