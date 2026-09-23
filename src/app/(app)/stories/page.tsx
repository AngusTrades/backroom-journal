import { requireInstagramOwner } from "@/lib/auth";
import { PageHead } from "@/components/PageHead";
import { StoryStudio } from "@/components/StoryStudio";

export const dynamic = "force-dynamic";
// Generating the text is a Claude call with the photos attached.
export const maxDuration = 60;

export default async function StoriesPage() {
  await requireInstagramOwner();
  return (
    <div>
      <PageHead
        title="Story Maker"
        subtitle="Drop in photos and a short brief. Get finished 1080×1920 story frames to download and post yourself."
      />
      <StoryStudio />
    </div>
  );
}
