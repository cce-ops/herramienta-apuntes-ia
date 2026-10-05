import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
} from "docx";
import type { Apunte, ContentBlock } from "./schema";

/* ---------- Helpers de estilo ---------- */

const COLOR = {
  h1: "1F4E79",
  h2: "2E74B5",
  h3: "333333",
  body: "262626",
  caption: "666666",
  ideaBg: "F1F8E9",
  ideaBorde: "4CAF50",
  ideaTexto: "2E7D32",
  azulBg: "E3F2FD",
  azulBorde: "1976D2",
  amarilloBg: "FFF8E1",
  amarilloBorde: "F9A825",
  verdeBg: "E8F5E9",
  verdeBorde: "388E3C",
  tablaHead: "D9E2F3",
};

function h1(texto: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({ text: texto, bold: true, size: 36, color: COLOR.h1 }),
    ],
  });
}

function h2(texto: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 140 },
    children: [
      new TextRun({ text: texto, bold: true, size: 28, color: COLOR.h2 }),
    ],
  });
}

function h3(texto: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text: texto, bold: true, size: 24, color: COLOR.h3 })],
  });
}

function parrafo(texto: string) {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text: texto, size: 22, color: COLOR.body })],
  });
}

function caption(texto: string) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({
        text: texto,
        italics: true,
        size: 18,
        color: COLOR.caption,
      }),
    ],
  });
}

function bullet(texto: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: texto, size: 22, color: COLOR.body }),
    ],
  });
}

function numerado(texto: string) {
  return new Paragraph({
    numbering: { reference: "lista-num", level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: texto, size: 22, color: COLOR.body }),
    ],
  });
}

/* ---------- Cajas con color ---------- */

function cajaColoreada(opts: {
  etiqueta?: string;
  texto: string;
  bg: string;
  borde: string;
  colorEtiqueta?: string;
}) {
  const runs: TextRun[] = [];
  if (opts.etiqueta) {
    runs.push(
      new TextRun({
        text: `${opts.etiqueta}  `,
        bold: true,
        size: 22,
        color: opts.colorEtiqueta ?? opts.borde,
      })
    );
  }
  runs.push(
    new TextRun({ text: opts.texto, size: 22, color: COLOR.body })
  );

  const bordeLateral: IBorderOptions = {
    style: BorderStyle.SINGLE,
    size: 30,
    color: opts.borde,
    space: 12,
  };
  const bordeFino: IBorderOptions = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: opts.borde,
    space: 8,
  };

  return new Paragraph({
    spacing: { before: 200, after: 200, line: 300 },
    shading: { type: ShadingType.CLEAR, fill: opts.bg, color: "auto" },
    border: {
      left: bordeLateral,
      top: bordeFino,
      bottom: bordeFino,
      right: bordeFino,
    },
    indent: { left: 240, right: 240 },
    children: runs,
  });
}

function cajaIdeaClave(texto: string) {
  return cajaColoreada({
    etiqueta: "IDEA CLAVE",
    texto,
    bg: COLOR.ideaBg,
    borde: COLOR.ideaBorde,
    colorEtiqueta: COLOR.ideaTexto,
  });
}

function cajaEnfasis(
  color: "azul" | "verde" | "amarillo",
  texto: string
) {
  const map = {
    azul: { bg: COLOR.azulBg, borde: COLOR.azulBorde },
    verde: { bg: COLOR.verdeBg, borde: COLOR.verdeBorde },
    amarillo: { bg: COLOR.amarilloBg, borde: COLOR.amarilloBorde },
  } as const;
  const c = map[color];
  return cajaColoreada({ texto, bg: c.bg, borde: c.borde });
}

function cajaFormula(latex: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200, line: 300 },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5", color: "auto" },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 6 },
    },
    children: [
      new TextRun({ text: latex, italics: true, size: 24, color: "1F1F1F" }),
    ],
  });
}

function bloqueDefinicion(termino: string, texto: string) {
  return new Paragraph({
    spacing: { before: 100, after: 120, line: 300 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: "9E9E9E", space: 10 },
    },
    indent: { left: 240 },
    children: [
      new TextRun({
        text: `${termino}: `,
        bold: true,
        size: 22,
        color: "1F1F1F",
      }),
      new TextRun({ text: texto, size: 22, color: COLOR.body }),
    ],
  });
}

/* ---------- Tabla ---------- */

function tabla(datos: {
  titulo?: string;
  columnas: string[];
  filas: string[][];
}): { tabla: Table; captionNodo?: Paragraph } {
  const filas: TableRow[] = [];
  const nCols = datos.columnas.length;

  // Normaliza filas irregulares del LLM al ancho del encabezado.
  const filasNorm = datos.filas.map((f) => {
    const recortada = f.slice(0, nCols);
    while (recortada.length < nCols) recortada.push("");
    return recortada.map((c) => String(c ?? ""));
  });

  // Encabezado
  filas.push(
    new TableRow({
      tableHeader: true,
      children: datos.columnas.map(
        (col) =>
          new TableCell({
            shading: {
              type: ShadingType.CLEAR,
              fill: COLOR.tablaHead,
              color: "auto",
            },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: col, bold: true, size: 20 }),
                ],
              }),
            ],
          })
      ),
    })
  );

  // Filas
  for (const fila of filasNorm) {
    filas.push(
      new TableRow({
        children: fila.map(
          (celda) =>
            new TableCell({
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: celda,
                      size: 20,
                      color: COLOR.body,
                    }),
                  ],
                }),
              ],
            })
        ),
      })
    );
  }

  const tableNode = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: filas,
  });

  return {
    tabla: tableNode,
    captionNodo: datos.titulo ? caption(datos.titulo) : undefined,
  };
}

/* ---------- Render de un bloque ---------- */

function renderBloque(
  bloque: ContentBlock
): (Paragraph | Table)[] {
  switch (bloque.tipo) {
    case "parrafo":
      return [parrafo(bloque.texto)];
    case "lista":
      return bloque.items.map((it) => bullet(it));
    case "lista_numerada":
      return bloque.items.map((it) => numerado(it));
    case "formula":
      return [cajaFormula(bloque.latex)];
    case "definicion":
      return [bloqueDefinicion(bloque.termino, bloque.texto)];
    case "idea_clave":
      return [cajaIdeaClave(bloque.texto)];
    case "caja_enfasis":
      return [cajaEnfasis(bloque.color, bloque.texto)];
    case "cita":
      return [
        new Paragraph({
          spacing: { after: 120, line: 300 },
          indent: { left: 480 },
          children: [
            new TextRun({
              text: `${bloque.texto} ${bloque.fuente}`,
              italics: true,
              size: 20,
              color: COLOR.caption,
            }),
          ],
        }),
      ];
    case "tabla": {
      const { tabla: t, captionNodo } = tabla(bloque);
      const salida: (Paragraph | Table)[] = [];
      if (captionNodo) salida.push(captionNodo);
      salida.push(t);
      salida.push(
        new Paragraph({ spacing: { after: 120 }, children: [] })
      );
      return salida;
    }
    default:
      return [];
  }
}

/* ---------- Documento completo ---------- */

export function construirDocumento(apunte: Apunte): Document {
  const children: (Paragraph | Table)[] = [];

  // Portada mínima
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({
          text: apunte.titulo_documento,
          bold: true,
          size: 52,
          color: COLOR.h1,
        }),
      ],
    })
  );

  // Índice manual sencillo
  children.push(h2("Contenido"));
  for (const ap of apunte.apartados) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: `${ap.numero}. ${ap.titulo}`,
            size: 22,
            color: COLOR.body,
          }),
        ],
      })
    );
    for (const sub of ap.subapartados) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text: `${sub.numero} ${sub.titulo}`,
              size: 20,
              color: COLOR.caption,
            }),
          ],
        })
      );
    }
  }

  // Apartados
  for (const ap of apunte.apartados) {
    children.push(h1(`${ap.numero}. ${ap.titulo}`));
    if (ap.introduccion) children.push(parrafo(ap.introduccion));

    for (const sub of ap.subapartados) {
      children.push(h2(`${sub.numero}. ${sub.titulo}`));
      for (const bloque of sub.contenido) {
        children.push(...renderBloque(bloque));
      }
    }
  }

  // Preguntas de repaso
  children.push(h1("Preguntas de repaso"));
  apunte.preguntas_repaso.forEach((p, i) => {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true, size: 22 }),
          new TextRun({ text: p, size: 22, color: COLOR.body }),
        ],
      })
    );
  });

  // Referencias (puede venir vacía si el material no cita fuentes: no inventar)
  if (apunte.referencias.length > 0) {
    children.push(h1("Referencias"));
    for (const r of apunte.referencias) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `${r.autor} (${r.anio}). `,
              size: 20,
              color: COLOR.body,
            }),
            new TextRun({
              text: `${r.titulo}. `,
              italics: true,
              size: 20,
              color: COLOR.body,
            }),
            ...(r.url
              ? [new TextRun({ text: r.url, size: 18, color: "0563C1" })]
              : []),
          ],
        })
      );
    }
  }

  return new Document({
    creator: "Apuntes IA",
    title: apunte.titulo_documento,
    description: "Apuntes generados automáticamente",
    numbering: {
      config: [
        {
          reference: "lista-num",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1417, right: 1417 },
          },
        },
        children,
      },
    ],
  });
}

/* ---------- Packer browser ---------- */

/** Limpia un título controlado por el LLM para usarlo como nombre de archivo. */
export function sanearNombreArchivo(nombre: string, fallback = "apuntes"): string {
  const sinExt = nombre.replace(/\.[^.]+$/, "");
  const limpio = sinExt
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return limpio || fallback;
}

export async function descargarDocx(
  apunte: Apunte,
  nombreArchivo = "apuntes.docx"
) {
  const doc = construirDocumento(apunte);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanearNombreArchivo(nombreArchivo) + "_apuntes.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}