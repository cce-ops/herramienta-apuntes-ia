import { NextRequest, NextResponse } from "next/server";
import { parseArchivo } from "@/lib/parser";
import {
  generarApuntesConFallback,
  GeminiError,
  type ModeloId,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min (Pro). En Hobby se recorta a 60s.

/** Tope de caracteres de las instrucciones del profesor. */
const MAX_INSTRUCCIONES = 6000;

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
    if (!apiKey)
      return NextResponse.json(
        { error: "Falta la API key de Gemini." },
        { status: 400 }
      );
    if (!modelo)
      return NextResponse.json({ error: "Falta el modelo." }, { status: 400 });

    const parsed = await parseArchivo(file);

    const resultado = await generarApuntesConFallback({
      apiKey,
      modeloPreferido: modelo,
      material: parsed.texto,
      nombreArchivo: parsed.nombre,
      instrucciones,
    });

    const huboFallback = resultado.modeloUsado !== modelo;

    return NextResponse.json({
      ok: true,
      apunte: resultado.apunte,
      meta: {
        archivo: parsed.nombre,
        caracteres_originales: parsed.caracteres,
        modelo_solicitado: modelo,
        modelo_usado: resultado.modeloUsado,
        hubo_fallback: huboFallback,
        intentos: resultado.intentos,
      },
    });
  } catch (err) {
    const esGemini = err instanceof GeminiError;
    const mensaje =
      err instanceof Error ? err.message : "Error desconocido";

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