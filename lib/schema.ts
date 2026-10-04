import { z } from "zod";

/* ------- Bloques atómicos dentro de cada subapartado ------- */
export const ContentBlockSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("parrafo"), texto: z.string() }),
  z.object({ tipo: z.literal("lista"), items: z.array(z.string()).min(1) }),
  z.object({ tipo: z.literal("lista_numerada"), items: z.array(z.string()).min(1) }),
  z.object({
    tipo: z.literal("tabla"),
    titulo: z.string().optional(),
    columnas: z.array(z.string()).min(2).max(5),
    filas: z.array(z.array(z.string())).min(1),
  }),
  z.object({ tipo: z.literal("formula"), latex: z.string() }),
  z.object({
    tipo: z.literal("definicion"),
    termino: z.string(),
    texto: z.string(),
  }),
  z.object({ tipo: z.literal("idea_clave"), texto: z.string() }),
  z.object({
    tipo: z.literal("caja_enfasis"),
    color: z.enum(["azul", "verde", "amarillo"]),
    texto: z.string(),
  }),
  z.object({ tipo: z.literal("cita"), texto: z.string(), fuente: z.string() }),
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const SubApartadoSchema = z.object({
  numero: z.string(),
  titulo: z.string(),
  contenido: z.array(ContentBlockSchema).min(2),
});

export const ApartadoSchema = z.object({
  numero: z.string(),
  titulo: z.string(),
  introduccion: z.string(),
  subapartados: z.array(SubApartadoSchema).min(1),
});

export const ApunteSchema = z.object({
  titulo_documento: z.string(),
  apartados: z.array(ApartadoSchema).min(2).max(6),
  preguntas_repaso: z.array(z.string()).min(5).max(12),
  referencias: z
    .array(
      z.object({
        autor: z.string(),
        anio: z.string(),
        titulo: z.string(),
        url: z.string().optional(),
      })
    )
    .min(1),
});

export type Apunte = z.infer<typeof ApunteSchema>;
export type Apartado = z.infer<typeof ApartadoSchema>;
export type SubApartado = z.infer<typeof SubApartadoSchema>;