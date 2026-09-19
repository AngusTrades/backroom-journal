// pdfjs-dist ships this as a plain worker script with no type declarations
// of its own — see src/lib/pdfTransactions.ts for why it's imported
// directly (statically) rather than left to pdf.js's own dynamic-import
// fallback.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
