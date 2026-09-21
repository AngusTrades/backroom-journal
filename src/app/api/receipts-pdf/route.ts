import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireUser } from "@/lib/auth";
import { getReceiptsForYearWithFiles } from "@/db/queries";

// GET /api/receipts-pdf?year=2026 — bundles every receipt held for that tax
// year into one downloadable PDF: an already-PDF receipt has its pages
// copied straight in, an image receipt gets its own Letter-sized page with
// the image centered and a small date/label caption. Kept as a route
// handler (not a server action) since a server action can't hand the
// browser a binary file download directly — this is the same reason the
// existing chart-screenshot/print flows stay in plain HTML/CSS rather than
// trying to force a file response through the action protocol.
//
// Deliberately NOT merged with the printed Tax Year Summary ledger into one
// combined file — the two travel as companion downloads instead (Print /
// Save as PDF for the ledger, this for the receipts), see the comment on
// PrintButton for the ledger side of that split.

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 40;

function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

export async function GET(req: NextRequest) {
  const user = await requireUser();

  const yearParam = req.nextUrl.searchParams.get("year");
  const nowYear = new Date().getFullYear();
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : nowYear;

  const rows = await getReceiptsForYearWithFiles(user.id, year);
  if (rows.length === 0) {
    return NextResponse.json({ error: `No receipts held for ${year}.` }, { status: 404 });
  }

  const out = await PDFDocument.create();
  out.setTitle(`${user.name} — ${year} Receipts`);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

  for (const r of rows) {
    try {
      if (r.contentType === "application/pdf") {
        const bytes = base64ToBytes(r.fileDataUrl);
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        continue;
      }

      // Image receipt — one Letter page, image centered under a small
      // caption line so a loose page out of the packet still identifies
      // itself.
      const bytes = base64ToBytes(r.fileDataUrl);
      const image = r.contentType === "image/png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const page = out.addPage([LETTER_WIDTH, LETTER_HEIGHT]);

      const captionY = LETTER_HEIGHT - MARGIN;
      const caption = `${dateFmt.format(r.date)}${r.label ? ` — ${r.label}` : ""}`;
      page.drawText(caption, { x: MARGIN, y: captionY - 10, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      page.drawText(r.fileName, { x: MARGIN, y: captionY - 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

      const availW = LETTER_WIDTH - MARGIN * 2;
      const availH = LETTER_HEIGHT - MARGIN * 2 - 40; // minus the caption block above
      const scale = Math.min(availW / image.width, availH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      const x = (LETTER_WIDTH - w) / 2;
      const y = MARGIN + (availH - h) / 2;
      page.drawImage(image, { x, y, width: w, height: h });
    } catch {
      // One corrupt/unreadable file shouldn't take down the whole packet —
      // drop in a placeholder page saying so instead of failing the
      // download outright.
      const page = out.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      page.drawText(`Couldn't read this receipt: ${r.fileName}`, { x: MARGIN, y: LETTER_HEIGHT - MARGIN - 10, size: 11, font, color: rgb(0.6, 0.1, 0.1) });
      page.drawText(`${dateFmt.format(r.date)}${r.label ? ` — ${r.label}` : ""}`, { x: MARGIN, y: LETTER_HEIGHT - MARGIN - 26, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
  }

  const pdfBytes = await out.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipts-${year}.pdf"`,
    },
  });
}
