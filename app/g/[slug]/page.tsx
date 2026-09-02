import { PublicGuideProfile } from "@/components/public/public-guide-profile";

export default async function PublicGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <PublicGuideProfile slug={slug} />
    </main>
  );
}
