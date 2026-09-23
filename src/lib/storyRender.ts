/**
 * Renders one story frame — the photo, cover-fit to 1080x1920, with the
 * headline/body overlaid in Backroom "Amber Noir" styling. Runs in the
 * browser (canvas), so the editor preview IS the final image: the same
 * canvas gets exported as the JPEG that's posted.
 *
 * Layout respects Instagram's story safe zones: nothing important in the top
 * ~250px (progress bar + profile row) or bottom ~340px (reply bar), so the
 * text block is anchored above that bottom band.
 */
export const STORY_W = 1080;
export const STORY_H = 1920;

const SAFE_BOTTOM = 360;
const SIDE = 90;
const TEXT_W = STORY_W - SIDE * 2;

const COLORS = {
  text: "#f3ead9",
  soft: "#e2d6bd",
  accent: "#e8963c",
  shade: "6, 6, 5",
};

const HEADLINE_FONT = '600 92px "Newsreader Variable", Georgia, serif';
const BODY_FONT = '500 48px "Source Sans 3 Variable", system-ui, sans-serif';
const MARK_FONT = '700 30px "Space Mono", ui-monospace, monospace';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't load photo"));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

let fontsReady: Promise<unknown> | null = null;
function ensureFonts() {
  fontsReady ??= Promise.all([
    document.fonts.load(HEADLINE_FONT),
    document.fonts.load(BODY_FONT),
    document.fonts.load(MARK_FONT),
  ]).catch(() => undefined);
  return fontsReady;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export type TextPosition = "top" | "bottom";

export type FrameInput = {
  photo: string;
  headline: string;
  body: string;
  /** Crop center as 0..1 of the photo (the subject). Default: center. */
  focusX?: number | null;
  focusY?: number | null;
  textPos?: TextPosition;
};

/** Size the photo is drawn at inside the 1080x1920 frame. The editor uses
 * this to turn a drag in pixels into a change of focus point. */
export type FrameLayout = { drawnW: number; drawnH: number };

// Top ~250px of a story is covered by the progress bar + profile row, the
// bottom ~340px by the reply bar.
const SAFE_TOP = 330;

/** Top-left offset that puts the focus point as close to the frame's center
 * as the photo's edges allow (no empty bars). */
export function cropOffset(drawn: number, frame: number, focus: number) {
  const offset = frame / 2 - focus * drawn;
  return Math.min(0, Math.max(frame - drawn, offset));
}

export async function renderStoryFrame(canvas: HTMLCanvasElement, frame: FrameInput): Promise<FrameLayout> {
  const { photo, headline, body } = frame;
  const textPos: TextPosition = frame.textPos ?? "bottom";
  await ensureFonts();
  const img = await loadImage(photo);

  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");

  // Photo, cover-fit, cropped around the subject. A landscape photo fills
  // the height and slides sideways; a tall one fills the width and slides
  // vertically.
  ctx.fillStyle = "#060605";
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const scale = Math.max(STORY_W / img.width, STORY_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const fx = frame.focusX ?? 0.5;
  const fy = frame.focusY ?? 0.5;
  ctx.drawImage(img, cropOffset(dw, STORY_W, fx), cropOffset(dh, STORY_H, fy), dw, dh);

  // Measure the text first so its shade can grow with it.
  ctx.font = HEADLINE_FONT;
  const hLines = headline.trim() ? wrap(ctx, headline.trim(), TEXT_W) : [];
  ctx.font = BODY_FONT;
  const bLines = body.trim() ? wrap(ctx, body.trim(), TEXT_W) : [];
  const H_LH = 98;
  const B_LH = 64;
  const GAP = hLines.length && bLines.length ? 30 : 0;
  const BAR = hLines.length || bLines.length ? 44 : 0;
  const blockH = BAR + hLines.length * H_LH + GAP + bLines.length * B_LH;
  const blockTop = textPos === "top" ? SAFE_TOP + 60 : STORY_H - SAFE_BOTTOM - blockH;

  if (textPos === "top") {
    // Shade from the top down behind the wordmark + text.
    const shadeBottom = Math.min(STORY_H, blockTop + blockH + 420);
    const g = ctx.createLinearGradient(0, 0, 0, shadeBottom);
    g.addColorStop(0, `rgba(${COLORS.shade}, 0.92)`);
    g.addColorStop(0.55, `rgba(${COLORS.shade}, 0.72)`);
    g.addColorStop(1, `rgba(${COLORS.shade}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STORY_W, shadeBottom);
  } else {
    const top = ctx.createLinearGradient(0, 0, 0, 480);
    top.addColorStop(0, `rgba(${COLORS.shade}, 0.55)`);
    top.addColorStop(1, `rgba(${COLORS.shade}, 0)`);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, STORY_W, 480);
    const shadeTop = Math.max(0, blockTop - 420);
    const bottom = ctx.createLinearGradient(0, shadeTop, 0, STORY_H);
    bottom.addColorStop(0, `rgba(${COLORS.shade}, 0)`);
    bottom.addColorStop(0.45, `rgba(${COLORS.shade}, 0.72)`);
    bottom.addColorStop(1, `rgba(${COLORS.shade}, 0.92)`);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, shadeTop, STORY_W, STORY_H - shadeTop);
  }

  // Wordmark: always top-left, above the text when the text is at the top.
  ctx.font = MARK_FONT;
  ctx.fillStyle = COLORS.accent;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  ctx.fillText("THE BACKROOM", SIDE, 300);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

  // Text block.
  let y = blockTop;
  if (BAR) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(SIDE, y, 88, 7);
    y += BAR;
  }
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.font = HEADLINE_FONT;
  ctx.fillStyle = COLORS.text;
  for (const line of hLines) {
    y += H_LH;
    ctx.fillText(line, SIDE, y - 20);
  }
  y += GAP;
  ctx.font = BODY_FONT;
  ctx.fillStyle = COLORS.soft;
  for (const line of bLines) {
    y += B_LH;
    ctx.fillText(line, SIDE, y - 14);
  }
  ctx.shadowBlur = 0;
  return { drawnW: dw, drawnH: dh };
}

/** Where the subject ends up vertically in the finished frame (0..1). Used
 * to put the text on the opposite half so it doesn't cover the subject. */
export function subjectFrameY(imgW: number, imgH: number, focusY: number) {
  const scale = Math.max(STORY_W / imgW, STORY_H / imgH);
  const dh = imgH * scale;
  return (cropOffset(dh, STORY_H, focusY) + focusY * dh) / STORY_H;
}

/** Natural size of a photo (cached with the renderer's image loads). */
export async function photoSize(src: string) {
  const img = await loadImage(src);
  return { w: img.width, h: img.height };
}

export function exportFrameJpeg(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", 0.88);
}

/** Resize an uploaded photo client-side before it's sent anywhere (long edge
 * 1920px is plenty for a 1080x1920 story and keeps the upload small). */
export async function compressPhoto(file: File, MAX = 1920, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > MAX || height > MAX) {
    const s = MAX / Math.max(width, height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image in this browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return c.toDataURL("image/jpeg", quality);
}
