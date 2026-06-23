// In-browser OCR / text extraction (no cloud, no API key needed here).
//   Digital PDF  -> pdf.js text layer (fast, exact).
//   Scanned PDF  -> render pages -> Tesseract OCR.
//   Image/photo  -> Tesseract OCR (English + Simplified Chinese).
// The extracted TEXT is then sent to the API, where DeepSeek structures it.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker, type Worker } from 'tesseract.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type Progress = (msg: string) => void;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

async function tesseract(): Promise<Worker> {
  return createWorker('eng+chi_sim');
}

async function pdfText(file: File, onProgress?: Progress): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  // No real text layer => scanned PDF => OCR the rendered pages.
  if (text.replace(/\s/g, '').length < 20) {
    onProgress?.('Scanned PDF — running OCR…');
    const worker = await tesseract();
    text = '';
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        onProgress?.(`OCR page ${p}/${doc.numPages}…`);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data: r } = await worker.recognize(canvas);
        text += r.text + '\n';
      }
    } finally {
      await worker.terminate();
    }
  }
  return text;
}

async function imageText(file: File, onProgress?: Progress): Promise<string> {
  onProgress?.('Reading photo with OCR…');
  const worker = await tesseract();
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** Extract plain text from a mix of PDFs and images. */
export async function extractText(files: File[], onProgress?: Progress): Promise<string> {
  let all = '';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(`Reading ${i + 1}/${files.length}: ${f.name}`);
    all += (isPdf(f) ? await pdfText(f, onProgress) : await imageText(f, onProgress)) + '\n\n';
  }
  return all.trim();
}
