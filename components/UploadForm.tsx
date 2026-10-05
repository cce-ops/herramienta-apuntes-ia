"use client";

import { useState } from "react";
import {
  MODELOS_DISPONIBLES,
  INTENTOS_POR_MODELO,
  DELAYS_MS,
  type ModeloId,
} from "@/lib/gemini";
import type { Apunte } from "@/lib/schema";

export type MetaGeneracion = {
  archivo: string;
  caracteres_originales: number;
  caracteres_enviados?: number;
  truncado?: boolean;
  modelo_solicitado: ModeloId;
  modelo_usado: ModeloId;
  hubo_fallback: boolean;
  intentos: {
    modelo: ModeloId;
    intento: number;
    ok: boolean;
    error?: string;
    status?: number;
    duracionMs: number;
  }[];
};

type Props = {
  onResultado: (apunte: Apunte, meta: MetaGeneracion) => void;
};

const MAX_INSTRUCCIONES = 6000;
const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024; // 20 MB, igual que el servidor

export default function UploadForm({ onResultado }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [instrucciones, setInstrucciones] = useState<string>("");
  const [guiaAdjunta, setGuiaAdjunta] = useState<string>("");
  const [nombreGuia, setNombreGuia] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [modelo, setModelo] = useState<ModeloId>("gemini-3.5-flash");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Concatena lo escrito + el contenido del archivo de guía en un solo bloque.
  const instruccionesFinales = [
    instrucciones.trim(),
    guiaAdjunta.trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_INSTRUCCIONES);

  async function cargarGuia(archivo: File | null) {
    if (!archivo) {
      setGuiaAdjunta("");
      setNombreGuia(null);
      return;
    }
    const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["md", "markdown", "txt"].includes(ext)) {
      setError("La guía debe ser .md o .txt.");
      return;
    }
    if (archivo.size > 200_000) {
      setError("La guía es demasiado grande (máx. 200 KB).");
      return;
    }
    try {
      const texto = await archivo.text();
      setGuiaAdjunta(texto);
      setNombreGuia(archivo.name);
      setError(null);
    } catch {
      setError("No se pudo leer el archivo de guía.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Selecciona un archivo.");
    if (file.size > MAX_ARCHIVO_BYTES)
      return setError(
        `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`
      );
    if (!apiKey.trim())
      return setError("Introduce tu API key de Gemini.");

    setCargando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("apiKey", apiKey.trim());
      fd.append("modelo", modelo);
      fd.append("instrucciones", instruccionesFinales);

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error ?? "Error desconocido");
      onResultado(json.apunte, json.meta as MetaGeneracion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  // Índice del modelo elegido para mostrar la cascada que se intentará
  const idx = MODELOS_DISPONIBLES.findIndex((m) => m.id === modelo);
  const cascada =
    idx >= 0
      ? [...MODELOS_DISPONIBLES.slice(idx), ...MODELOS_DISPONIBLES.slice(0, idx)]
      : [...MODELOS_DISPONIBLES];

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5"
    >
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          1. Material docente
        </label>
        <input
          type="file"
          accept=".docx,.pdf,.pptx,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white hover:file:bg-secondary file:cursor-pointer"
        />
        <p className="mt-1 text-xs text-slate-500">
          Formatos admitidos: DOCX, PDF, PPTX, MD, TXT. Máximo 20 MB.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          2. API key de Gemini
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-slate-500">
          Se usa solo para esta petición. No se almacena en el servidor.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          3. Modelo preferido
        </label>
        <select
          value={modelo}
          onChange={(e) => setModelo(e.target.value as ModeloId)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {MODELOS_DISPONIBLES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta}
            </option>
          ))}
        </select>
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer select-none">
            Si falla, se reintentará automáticamente con esta cascada:
          </summary>
          <ol className="mt-2 pl-4 list-decimal space-y-0.5">
            {cascada.map((m, i) => (
              <li key={m.id}>
                <code className="bg-slate-100 px-1 rounded">{m.id}</code>
                {i === 0 && (
                  <span className="ml-2 text-primary font-semibold">
                    ← preferido
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2">
            Hasta {INTENTOS_POR_MODELO} intentos por modelo
            {DELAYS_MS.length > 0 &&
              ` con espera de ${DELAYS_MS.map((d) => `${d / 1000} s`).join(", ")}`}
            .
          </p>
        </details>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          4. Instrucciones para la IA (opcional)
        </label>
        <textarea
          value={instrucciones}
          onChange={(e) => setInstrucciones(e.target.value)}
          rows={4}
          placeholder="Ej: prioriza las tablas comparativas, usa 4 apartados, redacta en 2ª persona, adds un apartado de ejemplos resueltos, tono más formal..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />

        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-500 cursor-pointer underline">
            Adjuntar guía .md / .txt
            <input
              type="file"
              accept=".md,.markdown,.txt"
              className="hidden"
              onChange={(e) => cargarGuia(e.target.files?.[0] ?? null)}
            />
          </label>
          {nombreGuia && (
            <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
              {nombreGuia}
              <button
                type="button"
                onClick={() => cargarGuia(null)}
                className="text-slate-500 hover:text-red-600"
                aria-label={`Quitar ${nombreGuia}`}
              >
                ×
              </button>
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Lo que escribas y lo que adjuntes se envían como instrucciones
          prioritarias. {instruccionesFinales.length} / {MAX_INSTRUCCIONES}{" "}
          caracteres.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={cargando}
        className="w-full rounded-lg bg-primary text-white font-semibold py-3 hover:bg-secondary transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cargando ? "Generando apuntes..." : "Generar apuntes"}
      </button>

      {cargando && (
        <p className="text-xs text-slate-500 text-center">
          Si el modelo principal está saturado, se reintentará y, si es necesario,
          se probarán los siguientes de la cascada. Puede tardar 1–2 minutos.
        </p>
      )}
    </form>
  );
}