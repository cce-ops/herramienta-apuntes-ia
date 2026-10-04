"use client";

import { useState } from "react";
import type { Apunte, ContentBlock } from "@/lib/schema";
import { descargarDocx } from "@/lib/docx-generator";
import type { MetaGeneracion } from "./UploadForm";

function Bloque({ b }: { b: ContentBlock }) {
  switch (b.tipo) {
    case "parrafo":
      return <p>{b.texto}</p>;
    case "lista":
      return (
        <ul>
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "lista_numerada":
      return (
        <ol>
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case "tabla":
      return (
        <div>
          {b.titulo && (
            <p className="text-xs italic text-slate-500 mb-1">{b.titulo}</p>
          )}
          <table>
            <thead>
              <tr>
                {b.columnas.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.filas.map((f, i) => (
                <tr key={i}>
                  {f.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "formula":
      return <div className="formula">{b.latex}</div>;
    case "definicion":
      return (
        <div className="definicion">
          <strong>{b.termino}:</strong> {b.texto}
        </div>
      );
    case "idea_clave":
      return (
        <div className="idea">
          <strong className="text-green-700">IDEA CLAVE&nbsp;&nbsp;</strong>
          {b.texto}
        </div>
      );
    case "caja_enfasis": {
      const cls =
        b.color === "azul"
          ? "caja-azul"
          : b.color === "amarillo"
            ? "caja-amarilla"
            : "idea";
      return <div className={cls}>{b.texto}</div>;
    }
    case "cita":
      return (
        <p className="italic text-slate-500 pl-6">
          {b.texto} {b.fuente}
        </p>
      );
    default:
      return null;
  }
}

function PanelIntentos({ meta }: { meta: MetaGeneracion }) {
  const [abierto, setAbierto] = useState(false);
  const fallos = meta.intentos.filter((i) => !i.ok).length;

  return (
    <div
      className={`mb-4 rounded-lg border text-sm ${
        meta.hubo_fallback
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-green-50 border-green-200 text-green-900"
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-center justify-between"
      >
        <span>
          {meta.hubo_fallback ? (
            <>
              Aviso: se uso <strong>{meta.modelo_usado}</strong> tras fallar{" "}
              <strong>{meta.modelo_solicitado}</strong>
            </>
          ) : (
            <>
              Generado con <strong>{meta.modelo_usado}</strong> al primer
              intento
            </>
          )}
          {fallos > 0 && (
            <span className="ml-2 text-xs opacity-75">
              ({fallos} {fallos === 1 ? "intento fallido" : "intentos fallidos"})
            </span>
          )}
        </span>
        <span className="text-xs">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <ul className="px-3 pb-3 space-y-1 font-mono text-xs">
          {meta.intentos.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`inline-block w-4 text-center ${
                  it.ok ? "text-green-600" : "text-red-600"
                }`}
              >
                {it.ok ? "v" : "x"}
              </span>
              <span className="flex-1">
                <code>{it.modelo}</code> · intento {it.intento} ·{" "}
                {(it.duracionMs / 1000).toFixed(1)}s
                {it.status ? ` · HTTP ${it.status}` : ""}
                {it.error && (
                  <div className="text-red-700 opacity-80">{it.error}</div>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PreviewPane({
  apunte,
  meta,
}: {
  apunte: Apunte;
  meta?: MetaGeneracion;
}) {
  const [descargando, setDescargando] = useState(false);

  async function handleDescargar() {
    setDescargando(true);
    try {
      await descargarDocx(apunte, apunte.titulo_documento);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {meta && <PanelIntentos meta={meta} />}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Vista previa</h2>
        <button
          onClick={handleDescargar}
          disabled={descargando}
          className="rounded-lg bg-green-600 text-white text-sm font-semibold px-4 py-2 hover:bg-green-700 disabled:opacity-50"
        >
          {descargando ? "Preparando..." : "Descargar Word"}
        </button>
      </div>

      <article className="prose-apunte max-w-none">
        <h1 className="!text-3xl text-center">{apunte.titulo_documento}</h1>

        {apunte.apartados.map((ap) => (
          <section key={ap.numero}>
            <h1>
              {ap.numero}. {ap.titulo}
            </h1>
            {ap.introduccion && <p>{ap.introduccion}</p>}
            {ap.subapartados.map((sub) => (
              <div key={sub.numero}>
                <h2>
                  {sub.numero}. {sub.titulo}
                </h2>
                {sub.contenido.map((b, i) => (
                  <Bloque key={i} b={b} />
                ))}
              </div>
            ))}
          </section>
        ))}

        <h1>Preguntas de repaso</h1>
        <ol>
          {apunte.preguntas_repaso.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>

        <h1>Referencias</h1>
        <ul className="!list-none !pl-0">
          {apunte.referencias.map((r, i) => (
            <li key={i} className="text-sm text-slate-600">
              {r.autor} ({r.anio}). <em>{r.titulo}</em>.{" "}
              {r.url && <span className="text-blue-600">{r.url}</span>}
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}