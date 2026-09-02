import Link from "next/link";
import { GuideProfileForm } from "@/components/operator/guide-profile-form";

export default function NewGuidePage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/guide/my-guides" className="text-sm text-[#D4AA25] hover:underline">
        ← My Guides
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-6">Add a new guide</h1>
      <GuideProfileForm />
    </main>
  );
}
