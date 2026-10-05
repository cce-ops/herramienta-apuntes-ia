import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type ParsedFile = {
  nombre: string;
  tipo: string;
  texto: string;
  caracteres: number;
};

const MAX_CHARS = 200_000;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, en línea con app/api/generate/route.ts

function limpiar(txt: string): string {
  return txt
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

/* ---------------- DOCX ---------------- */
async function parseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/* ---------------- PDF ---------------- */
async function parsePdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

/* ---------------- PPTX ---------------- */
async function parsePptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  const partes: string[] = [];
  for (const nombre of slides) {
    const xml = await zip.files[nombre].async("string");
    const textos = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    const idx = nombre.match(/slide(\d+)/)?.[1] ?? "?";
    if (textos.length) {
      partes.push(`## Diapositiva ${idx}\n${textos.join(" ")}`);
    }
  }
  return partes.join("\n\n");
}

/* ---------------- MD / TXT ---------------- */
async function parseTexto(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8");
}

/* ---------------- Dispatcher ---------------- */
export async function parseArchivo(file: File): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    throw new Error("Archivo demasiado grande. Máximo 20 MB.");
  }
  const nombre = file.name;
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";

  let texto = "";
  switch (ext) {
    case "docx":
      texto = await parseDocx(buffer);
      break;
    case "pdf":
      texto = await parsePdf(buffer);
      break;
    case "pptx":
      texto = await parsePptx(buffer);
      break;
    case "md":
    case "markdown":
    case "txt":
      texto = await parseTexto(buffer);
      break;
    default:
      throw new Error(
        `Formato no soportado: .${ext}. Usa DOCX, PDF, PPTX, MD o TXT.`
      );
  }

  texto = limpiar(texto);

  if (texto.length < 200) {
    throw new Error(
      `El archivo "${nombre}" contiene muy poco texto (${texto.length} caracteres). ¿Es un PDF escaneado?`
    );
  }

  return { nombre, tipo: ext, texto, caracteres: texto.length };
}