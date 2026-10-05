import { ApunteSchema, type Apunte } from "./schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

/* ============================================================
 *  Modelos disponibles (orden = prioridad de fallback)
 * ============================================================ */
export const MODELOS_DISPONIBLES = [
  { id: "gemini-3.8-flash", etiqueta: "Gemini 3.8 Flash (máxima calidad)" },
  { id: "gemini-3.7-flash", etiqueta: "Gemini 3.7 Flash" },
  { id: "gemini-3.6-flash", etiqueta: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", etiqueta: "Gemini 3.5 Flash (equilibrado)" },
  { id: "gemini-3.5-flash-lite", etiqueta: "Gemini 3.5 Flash Lite (rápido)" },
  { id: "gemini-3.1-flash-lite", etiqueta: "Gemini 3.1 Flash Lite (económico)" },
] as const;

export type ModeloId = (typeof MODELOS_DISPONIBLES)[number]["id"];

/** Orden canónico de fallback (de más capaz a más ligero). */
export const ORDEN_FALLBACK: ModeloId[] = MODELOS_DISPONIBLES.map(
  (m) => m.id
);

/* ============================================================
 *  Configuración del sistema de reintentos
 *  Valores ajustados al límite de 60 s del plan Hobby de Vercel:
 *  peor caso por modelo ≈ 25 s + 2 s + 25 s = 52 s + parseo.
 *  En plan Pro (maxDuration 300 s) puedes subir a 3 intentos
 *  y TIMEOUT_MS = 50_000.
 * ============================================================ */
export const INTENTOS_POR_MODELO = 2;
export const DELAYS_MS = [2000]; // longitud = INTENTOS_POR_MODELO - 1
export const TIMEOUT_MS = 25_000; // timeout por intento

/* ============================================================
 *  Errores
 * ============================================================ */
export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

function esErrorReintentable(status: number): boolean {
  if (status === 0) return true; // error de red
  if (status === 200) return true; // JSON inválido o esquema incorrecto (transitorio del modelo)
  if (status === 408) return true; // timeout
  if (status === 429) return true; // rate limit
  if (status >= 500 && status <= 599) return true; // servidor
  return false;
}

function esErrorFatal(status: number, mensaje = ""): boolean {
  if (status === 401 || status === 403) return true; // API key sin permisos
  // Google responde 400 "API key not valid" cuando la clave es incorrecta.
  // Sin esta detección se recorren los 6 modelos antes de avisar.
  if (/api[\s_-]?key/i.test(mensaje)) return true;
  return false;
}

/* ============================================================
 *  Utilidades
 * ============================================================ */
function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Evita devolver la API key al cliente si Gemini la ecoa en un mensaje. */
function redactarSecretos(mensaje: string, secreto: string): string {
  if (!secreto) return mensaje;
  // Sustitución directa + patrón genérico de keys de Google.
  return mensaje
    .split(secreto).join("[REDACTED]")
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[REDACTED]");
}

function extraerJSON(texto: string): unknown {
  const sinCercas = texto
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  // 1) Respuesta limpia: parse directo.
  try {
    return JSON.parse(sinCercas);
  } catch {
    // seguimos con extracción por llaves
  }
  // 2) Objeto exterior: primera "{" hasta la última "}".
  const inicio = sinCercas.indexOf("{");
  const fin = sinCercas.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new GeminiError("La respuesta no contiene JSON válido.", 200);
  }
  try {
    return JSON.parse(sinCercas.slice(inicio, fin + 1));
  } catch (err) {
    throw new GeminiError(
      `JSON inválido: ${err instanceof Error ? err.message : "?"}`,
      200
    );
  }
}

/* ============================================================
 *  Log público de intentos
 * ============================================================ */
export type IntentoLog = {
  modelo: ModeloId;
  intento: number; // 1, 2, 3...
  ok: boolean;
  error?: string;
  status?: number;
  duracionMs: number;
};

export type ResultadoGeneracion = {
  apunte: Apunte;
  modeloUsado: ModeloId;
  intentos: IntentoLog[];
};

/* ============================================================
 *  Llamada individual a Gemini (sin reintentos)
 * ============================================================ */
type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; code?: number };
};

async function llamarGeminiUnaVez(opts: {
  apiKey: string;
  modelo: ModeloId;
  material: string;
  nombreArchivo: string;
  instrucciones?: string;
}): Promise<Apunte> {
  const { apiKey, modelo, material, nombreArchivo, instrucciones } = opts;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ text: buildUserPrompt(material, nombreArchivo, instrucciones) }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    // La API key viaja en cabecera, nunca en la URL (evita fugas en logs).
    res = await fetch(`${GEMINI_ENDPOINT}/${modelo}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiError(
        `Timeout tras ${TIMEOUT_MS / 1000}s`,
        408
      );
    }
    throw new GeminiError(
      `Error de red: ${err instanceof Error ? err.message : "desconocido"}`,
      0
    );
  } finally {
    clearTimeout(timer);
  }

  let json: GeminiResponse;
  try {
    json = (await res.json()) as GeminiResponse;
  } catch {
    throw new GeminiError(
      `Respuesta no-JSON (HTTP ${res.status})`,
      res.status
    );
  }

  if (!res.ok) {
    throw new GeminiError(
      json.error?.message ?? `HTTP ${res.status}`,
      res.status
    );
  }

  const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) {
    throw new GeminiError("Gemini no devolvió texto.", res.status);
  }

  let crudo: unknown;
  try {
    crudo = extraerJSON(texto);
  } catch (err) {
    // Un JSON malformado puede ser transitorio, reintentamos.
    // extraerJSON ya devuelve GeminiError con status 200: no re-envolver.
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(
      `JSON inválido: ${err instanceof Error ? err.message : "?"}`,
      200
    );
  }

  const validado = ApunteSchema.safeParse(crudo);
  if (!validado.success) {
    // Esquema incorrecto: también lo tratamos como reintentable
    throw new GeminiError(
      "El JSON no cumple el esquema esperado.",
      200
    );
  }

  return validado.data;
}

/* ============================================================
 *  Motor principal: reintentos + fallback en cascada
 * ============================================================ */
export async function generarApuntesConFallback(opts: {
  apiKey: string;
  modeloPreferido: ModeloId;
  material: string;
  nombreArchivo: string;
  instrucciones?: string;
}): Promise<ResultadoGeneracion> {
  const { apiKey, modeloPreferido, material, nombreArchivo, instrucciones } =
    opts;

  // Construye la cola: empieza por el modelo elegido y sigue con el resto
  const idx = ORDEN_FALLBACK.indexOf(modeloPreferido);
  const cola: ModeloId[] =
    idx >= 0
      ? [...ORDEN_FALLBACK.slice(idx), ...ORDEN_FALLBACK.slice(0, idx)]
      : [...ORDEN_FALLBACK];

  const intentos: IntentoLog[] = [];
  let ultimoError = "sin intentos";

  for (const modelo of cola) {
    for (let i = 0; i < INTENTOS_POR_MODELO; i++) {
      const t0 = Date.now();
      try {
        const apunte = await llamarGeminiUnaVez({
          apiKey,
          modelo,
          material,
          nombreArchivo,
          instrucciones,
        });

        const log: IntentoLog = {
          modelo,
          intento: i + 1,
          ok: true,
          duracionMs: Date.now() - t0,
        };
        intentos.push(log);
        return { apunte, modeloUsado: modelo, intentos };
      } catch (err) {
        const status = err instanceof GeminiError ? err.status : 0;
        const mensajeBruto = err instanceof Error ? err.message : String(err);
        const mensaje = redactarSecretos(mensajeBruto, apiKey);

        const log: IntentoLog = {
          modelo,
          intento: i + 1,
          ok: false,
          error: mensaje,
          status,
          duracionMs: Date.now() - t0,
        };
        intentos.push(log);
        ultimoError = `[${modelo}] ${mensaje}`;

        // 1) API key inválida → abortar todo
        if (esErrorFatal(status, mensaje)) {
          throw new GeminiError(
            `API key inválida o sin permisos (HTTP ${status}). Revisa tu clave de Gemini.`,
            status
          );
        }

        // 2) Error no reintentable (400, 404...) → siguiente modelo sin reintentar
        if (!esErrorReintentable(status)) {
          break;
        }

        // 3) Error reintentable: esperar y volver a intentar (mismo modelo)
        const esUltimoIntento = i === INTENTOS_POR_MODELO - 1;
        if (!esUltimoIntento) {
          const espera = DELAYS_MS[i] ?? 5000;
          await dormir(espera);
        }
      }
    }
    // Agotados los intentos de este modelo → pasamos al siguiente
  }

  throw new GeminiError(
    `Todos los modelos fallaron. Último error: ${ultimoError}`,
    503
  );
}