import { NextRequest, NextResponse } from "next/server";
import { parseArchivo } from "@/lib/parser";
import { MATERIAL_MAX_CHARS } from "@/lib/prompts";
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

function esModeloValido(m: string): m is ModeloId {
  return (ORDEN_FALLBACK as string[]).includes(m);
}

/** Redacta posibles keys de Google en mensajes que vuelven al cliente. */
function redactar(mensaje: string): string {
  return mensaje.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[REDACTED]");
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const apiKey = String(form.get("apiKey") ?? "").trim();
    const modelo = String(form.get("modelo") ?? "").trim() as ModeloId;
    const instrucciones = String(form.get("instrucciones") ?? "")
      .trim()
      .slice(0, MAX_INSTRUCCIONES);

    if (!file)
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    if (file.size > MAX_ARCHIVO_BYTES)
      return NextResponse.json(
        {
          error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`,
        },
        { status: 413 }
      );
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
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
    if (!modelo || !esModeloValido(modelo))
      return NextResponse.json(
        { error: "Modelo no válido." },
        { status: 400 }
      );

    const parsed = await parseArchivo(file);

    const resultado = await generarApuntesConFallback({
      apiKey,
      modeloPreferido: modelo,
      material: parsed.texto,
      nombreArchivo: parsed.nombre,
      instrucciones,
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