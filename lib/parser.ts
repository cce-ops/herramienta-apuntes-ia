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

/* ---------- F1: cotas anti zip-bomb / documentos gigantes ---------- */
const MAX_ZIP_ENTRADAS = 1000; // entradas totales del ZIP (docx/pptx)
const MAX_XML_DOCUMENTO = 5 * 1024 * 1024; // word/document.xml o texto de slides acumulado
const MAX_PDF_PAGINAS = 100;
const PARSEO_TIMEOUT_MS = 20_000;

function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    timer = setTimeout(
      () => rechazar(new Error(`El ${etiqueta} es demasiado complejo (límite ${ms / 1000}s). Prueba con un archivo más pequeño.`)),
      ms
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

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
  // Pre-chequeo barato del ZIP antes de que mammoth lo expanda en memoria.
  const zip = await JSZip.loadAsync(buffer);
  const nombres = Object.keys(zip.files);
  if (nombres.length > MAX_ZIP_ENTRADAS) {
    throw new Error(
      `El DOCX tiene demasiadas entradas (${nombres.length}). Máximo ${MAX_ZIP_ENTRADAS}.`
    );
  }
  const doc = zip.file("word/document.xml");
  if (doc) {
    const xml = await doc.async("string");
    if (xml.length > MAX_XML_DOCUMENTO) {
      throw new Error(
        "El DOCX es demasiado grande al descomprimir. Prueba con un archivo más pequeño."
      );
    }
  }
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/* ---------------- PDF ---------------- */
async function parsePdf(buffer: Buffer): Promise<string> {
  return conTimeout(
    (async () => {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const paginas = (pdf as unknown as { numPages?: number }).numPages ?? 0;
      if (paginas > MAX_PDF_PAGINAS) {
        throw new Error(
          `El PDF tiene ${paginas} páginas. Máximo ${MAX_PDF_PAGINAS}.`
        );
      }
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n\n") : text;
    })(),
    PARSEO_TIMEOUT_MS,
    "PDF"
  );
}

/* ---------------- PPTX ---------------- */
async function parsePptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const nombres = Object.keys(zip.files);
  if (nombres.length > MAX_ZIP_ENTRADAS) {
    throw new Error(
      `El PPTX tiene demasiadas entradas (${nombres.length}). Máximo ${MAX_ZIP_ENTRADAS}.`
    );
  }
  const slides = nombres
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  const partes: string[] = [];
  let acumulado = 0;
  for (const nombre of slides) {
    const xml = await zip.files[nombre].async("string");
    acumulado += xml.length;
    if (acumulado > MAX_XML_DOCUMENTO) {
      throw new Error(
        "El PPTX es demasiado grande al descomprimir. Prueba con un archivo más pequeño."
      );
    }
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