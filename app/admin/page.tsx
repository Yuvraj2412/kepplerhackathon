import type { Metadata } from "next";
import { AdminApp } from "@/app/components/admin/AdminApp";
import { PageHeader } from "@/app/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "OC admin console",
  description: "Organizing Committee administration console for Kosmodrome 2026.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin" },
};

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <PageHeader
        eyebrow="Organizing committee"
        title="Admin console"
        description="Review registrations and college IDs, triage contact messages, publish problem files, manage judging, and verify the immutable ledger."
      />
      <div className="mt-10">
        <AdminApp />
      </div>
    </div>
  );
}
