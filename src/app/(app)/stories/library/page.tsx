import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { storyLibraryPhotos } from "@/db/schema";
import { requireInstagramOwner } from "@/lib/auth";
import { PageHead } from "@/components/PageHead";
import { StoryLibrary } from "@/components/StoryLibrary";

export const dynamic = "force-dynamic";

export default async function StoryLibraryPage() {
  const user = await requireInstagramOwner();
  const rows = await db
    .select({ id: storyLibraryPhotos.id })
    .from(storyLibraryPhotos)
    .where(eq(storyLibraryPhotos.userId, user.id))
    .orderBy(desc(storyLibraryPhotos.createdAt));

  return (
    <div>
      <PageHead title="Photo Library" subtitle="Upload once, then let Story Maker fill stories with random backgrounds." />
      <div style={{ marginBottom: 16 }}>
        <Link href="/stories" className="btn btn-ghost">← Back to Story Maker</Link>
      </div>
      <StoryLibrary ids={rows.map((r) => r.id)} max={300} />
    </div>
  );
}
