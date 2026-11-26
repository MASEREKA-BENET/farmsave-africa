import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public-header";

export function generateStaticParams() { return [{ legal: "privacy" }, { legal: "terms" }]; }

export default async function Legal({ params }: { params: Promise<{ legal: string }> }) {
  const { legal } = await params;
  if (!["privacy", "terms"].includes(legal)) notFound();
  const privacy = legal === "privacy";

  return <><PublicHeader /><main id="main" className="container-page max-w-3xl py-14">
    <p className="eyebrow">Pilot policy · 5 November 2026</p>
    <h1 className="mt-4 text-4xl font-bold">{privacy ? "Privacy notice" : "Terms of service"}</h1>
    <div className="mt-8 space-y-7 leading-relaxed text-muted-foreground">
      {privacy ? <>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">What we collect</h2><p>We store account names, email addresses, optional contact numbers, approximate farm areas, crop and harvest records, marketplace activity, support requests, and consented survey information. Coordinators may enroll farmers without email accounts. Precise private farm addresses are not published.</p></section>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Why and who can access it</h2><p>Data supports agricultural recordkeeping, buyer connections, transport coordination, and pilot evaluation. Farmers access their records; assigned coordinators access records within their authorized districts; administrators manage the pilot. Buyers see produce information and approximate districts, not private farmer profiles. Aggregated participation counts may be public.</p></section>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Your choices</h2><p>Participation and optional contact details are voluntary. Contact the pilot team to request access, corrections, withdrawal, or deletion, subject to necessary transaction record retention. Do not submit identity documents unless the pilot team has explained their purpose. Private documents are access-restricted.</p></section>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Security, retention, and hosting</h2><p>Access controls and audit logs protect records. Neon and the application host process data for database and application services. Before collecting real participant data, the pilot operator must disclose the hosting regions, data controller contact, and retention schedule. No hosting region, legal identity, or retention period is implied by this notice.</p></section>
      </> : <>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Service scope</h2><p>FarmSave Africa supports recordkeeping, produce discovery, offers, and coordination of post-harvest services. It does not process payments, guarantee a buyer or transport provider, certify agricultural advice, or replace an agreement between participants.</p></section>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Participant responsibilities</h2><p>Provide accurate information, protect account credentials, and use contact and marketplace features respectfully. Participants are responsible for confirming quantities, quality, prices, collection details, and service arrangements directly with one another.</p></section>
        <section><h2 className="mb-2 text-xl font-bold text-foreground">Pilot operator details</h2><p>The operating organization, contact details, applicable local terms, and complaint process must be supplied by the pilot operator before real participant enrollment. This application does not invent those details.</p></section>
      </>}
    </div>
  </main></>;
}
