import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/loan-terms")({
  component: LoanTermsPage,
  head: () => ({ meta: [{ title: "Loan & Credit Terms — BNP PARIBAS" }, { name: "description", content: "Eligibility, rates, fees and obligations for BNP PARIBAS loans." }] }),
});

function LoanTermsPage() {
  return (
    <LegalLayout title="Loan & Credit Terms" subtitle="Borrowing engages you. Repay your loan and check your repayment capacity before committing." updated="2026-06-22">
      <h2>1. Eligibility</h2><p>Verified identity, stable income, no active default. We perform credit and AML/KYC checks before approval.</p>
      <h2>2. Amounts & duration</h2><p>From 1,000 EUR to 500,000 EUR, 12 to 120 months. Approved amounts depend on your file and applicable law.</p>
      <h2>3. Rate & APR</h2><p>Fixed rate disclosed in your offer. The APR includes interest and mandatory fees.</p>
      <h2>4. Disbursement</h2><p>Funds are released after contract signature and ID verification. Releases above 50,000 EUR follow a staged anti-fraud process (63% / 88% / 100%).</p>
      <h2>5. Repayment</h2><p>Monthly direct debit on a fixed day. Early repayment is allowed with the legal cap on indemnities.</p>
      <h2>6. Default</h2><p>Late payments trigger interest, fees and may lead to acceleration, registration on payment incident databases and judicial recovery.</p>
      <h2>7. Right of withdrawal</h2><p>You have 14 calendar days from contract signature to withdraw without cause.</p>
    </LegalLayout>
  );
}
