import { NextRequest, NextResponse } from "next/server";
import { parseArchivo } from "@/lib/parser";
import { MATERIAL_MAX_CHARS, PAGINAS_DEFECTO, PAGINAS_MAX, PAGINAS_MIN } from "@/lib/prompts";
import {
  crearLimitador,
  sanearNombreSubida,
  superaLimite,
} from "@/lib/seguridad";
import {
  generarApuntesConFallback,
  GeminiError,
  ORDEN_FALLBACK,
  type ModeloId,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min (Pro). En Hobby se recorta a 60s.

/** Tope de caracteres de las instrucciones del profesor. */
const MAX_INSTRUCCIONES = 6000;

/** Tope de subida para no agotar la memoria de la función serverless. */
const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024; // 20 MB
const EXTENSIONES_VALIDAS = ["docx", "pdf", "pptx", "md", "markdown", "txt"];
const MAX_APIKEY_CHARS = 300;

/** F2: throttle best-effort por instancia (ver lib/seguridad.ts). */
const limitador = crearLimitador(8, 10 * 60 * 1000);

function esModeloValido(m: string): m is ModeloId {
  return (ORDEN_FALLBACK as string[]).includes(m);
}

/** Redacta posibles keys de Google en mensajes que vuelven al cliente. */
function redactar(mensaje: string): string {
  return mensaje.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[REDACTED]");
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      "desconocida";
    const limite = superaLimite(limitador, ip);
    if (limite.limitado) {
      return NextResponse.json(
        {
          error: `Demasiadas peticiones. Espera ${limite.reintentoSegs ?? 60}s e inténtalo de nuevo.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limite.reintentoSegs ?? 60) },
        }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const apiKey = String(form.get("apiKey") ?? "").trim();
    const modelo = String(form.get("modelo") ?? "").trim() as ModeloId;
    const instrucciones = String(form.get("instrucciones") ?? "")
      .trim()
      .slice(0, MAX_INSTRUCCIONES);
    const paginasBruto = String(form.get("paginas") ?? "").trim();
    let paginas = PAGINAS_DEFECTO;
    if (paginasBruto) {
      const n = Number.parseInt(paginasBruto, 10);
      if (Number.isFinite(n)) paginas = Math.min(Math.max(n, PAGINAS_MIN), PAGINAS_MAX);
    }

    if (!file)
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    // F3: el nombre viene del multipart y se usa en el prompt y en meta.
    const nombreSeguro = sanearNombreSubida(file.name);
    if (file.size > MAX_ARCHIVO_BYTES)
      return NextResponse.json(
        {
          error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`,
        },
        { status: 413 }
      );
    const ext = nombreSeguro.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES_VALIDAS.includes(ext))
      return NextResponse.json(
        { error: `Formato no soportado: .${ext}. Usa DOCX, PDF, PPTX, MD o TXT.` },
        { status: 400 }
      );
    if (!apiKey)
      return NextResponse.json(
        { error: "Falta la API key de Gemini." },
        { status: 400 }
      );
    if (apiKey.length > MAX_APIKEY_CHARS)
      return NextResponse.json(
        { error: "La API key es demasiado larga." },
        { status: 400 }
      );
    if (!modelo || !esModeloValido(modelo))
      return NextResponse.json(
        { error: "Modelo no válido." },
        { status: 400 }
      );

    const parsed = await parseArchivo(file);
    parsed.nombre = nombreSeguro;

    const resultado = await generarApuntesConFallback({
      apiKey,
      modeloPreferido: modelo,
      material: parsed.texto,
      nombreArchivo: parsed.nombre,
      instrucciones,
      paginas,
    });

    const huboFallback = resultado.modeloUsado !== modelo;
    const truncado = parsed.caracteres > MATERIAL_MAX_CHARS;

    return NextResponse.json({
      ok: true,
      apunte: resultado.apunte,
      meta: {
        archivo: parsed.nombre,
        caracteres_originales: parsed.caracteres,
        caracteres_enviados: Math.min(parsed.caracteres, MATERIAL_MAX_CHARS),
        truncado,
        modelo_solicitado: modelo,
        modelo_usado: resultado.modeloUsado,
        hubo_fallback: huboFallback,
        intentos: resultado.intentos,
        paginas_solicitadas: paginas,
      },
    });
  } catch (err) {
    const esGemini = err instanceof GeminiError;
    const mensajeBruto =
      err instanceof Error ? err.message : "Error desconocido";
    const mensaje = redactar(mensajeBruto);

    let status: number;
    if (!esGemini) {
      // Errores de entrada: formato no soportado, PDF escaneado, etc.
      status = 400;
    } else if (err.status === 401 || err.status === 403) {
      status = 401;
    } else {
      status = 503;
    }

    console.error("[generate]", mensaje);
    return NextResponse.json({ error: mensaje }, { status });
  }
}