import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { storyLibraryPhotos } from "@/db/schema";
import { getCurrentUser, isInstagramOwner } from "@/lib/auth";

// GET /api/story-photo/<id>?size=thumb|full: a Story Maker library photo.
// Only the Story Maker owner can load these (anyone else gets a 404, same as
// a photo that doesn't exist). Photos never change once uploaded, so the
// browser may cache them for good.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInstagramOwner(user) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const thumb = req.nextUrl.searchParams.get("size") === "thumb";
  const [row] = await db
    .select({ data: thumb ? storyLibraryPhotos.thumbData : storyLibraryPhotos.photoData })
    .from(storyLibraryPhotos)
    .where(and(eq(storyLibraryPhotos.id, id), eq(storyLibraryPhotos.userId, user.id)));
  if (!row) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(row.data.slice(row.data.indexOf(",") + 1), "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
