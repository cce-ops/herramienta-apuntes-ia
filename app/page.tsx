"use client";

import { useState } from "react";
import UploadForm, { type MetaGeneracion } from "@/components/UploadForm";
import PreviewPane from "@/components/PreviewPane";
import type { Apunte } from "@/lib/schema";

export default function Home() {
  const [apunte, setApunte] = useState<Apunte | null>(null);
  const [meta, setMeta] = useState<MetaGeneracion | null>(null);

  return (
    <main className="min-h-screen py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary">Apuntes IA</h1>
          <p className="mt-2 text-slate-600">
            Convierte tus materiales docentes en apuntes estructurados y dinámicos.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="md:sticky md:top-6 space-y-4">
            <UploadForm
              onResultado={(a, m) => {
                setApunte(a);
                setMeta(m);
              }}
            />
            {meta && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-0.5">
                <div>
                  <strong>Archivo:</strong> {meta.archivo}
                </div>
                <div>
                  <strong>Caracteres originales:</strong>{" "}
                  {meta.caracteres_originales.toLocaleString("es-ES")}
                </div>
                <div>
                  <strong>Modelo solicitado:</strong> {meta.modelo_solicitado}
                </div>
                <div>
                  <strong>Modelo usado:</strong> {meta.modelo_usado}
                </div>
                <div>
                  <strong>Intentos totales:</strong> {meta.intentos.length}
                </div>
              </div>
            )}
          </div>

          <div>
            {apunte ? (
              <PreviewPane apunte={apunte} meta={meta ?? undefined} />
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
                Sube un archivo para ver aquí los apuntes generados.
              </div>
            )}
          </div>
        </div>

        <footer className="mt-12 text-center text-xs text-slate-400">
          Apuntes IA · uso educativo · tu API key no se almacena.
        </footer>
      </div>
    </main>
  );
}