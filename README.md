# Apuntes IA

Herramienta que transforma materiales docentes (DOCX, PDF, PPTX, MD, TXT) en apuntes universitarios estructurados usando Gemini, y los exporta a un `.docx` editable con el formato de la asignatura "Diseño sostenible".

## Características

- Subida de un archivo y generación de apuntes en segundos.
- Cada profesor usa **su propia API key** de Gemini (no se almacena).
- **Recuadro de instrucciones**: escribe indicaciones directas o adjunta una guía `.md` / `.txt` que la IA seguirá al generar los apuntes.
- Salida con estructura fija: apartados, subapartados, tablas, fórmulas, definiciones, **Idea clave**, cajas de énfasis, preguntas de repaso y referencias.
- Descarga directa a `.docx` manteniendo estilos (colores, bordes, tablas).
- Reintentos automáticos y cascada entre modelos si el preferido falla.

## Requisitos

- Node.js 20+
- Una API key de Google Gemini (gratuita en https://aistudio.google.com/apikey)

## Arranque

```bash
npm install
npm run dev
# abrir http://localhost:3000
```

## Sistema de reintentos y fallback

El motor de generación aplica esta política:

| Etapa | Comportamiento |
| --- | --- |
| 1 | Se intenta con el **modelo elegido** por el profesor. |
| 2 | Si falla con error reintentable (429, 5xx, timeout, red), se **reintenta hasta 3 veces** con esperas de 2 s, 4 s y 8 s. |
| 3 | Si se agotan los intentos del modelo, se **pasa al siguiente** de la cascada. |
| 4 | La cascada recorre los 6 modelos en este orden: `3.8 → 3.7 → 3.6 → 3.5 → 3.5-lite → 3.1-lite`, empezando por el elegido. |
| 5 | Errores **no reintentables** (400, 404) saltan al siguiente modelo sin esperar. |
| 6 | Errores **fatales** (401, 403, o cualquier mensaje que mencione `API key`) abortan todo de inmediato. |
| 7 | Timeout por intento: **50 s**. |

Al terminar, el cliente recibe:

- `modelo_solicitado` y `modelo_usado` (para saber si hubo fallback).
- `intentos`: array con cada intento (modelo, nº de intento, duración, error si lo hubo).

La vista previa muestra un **panel plegable** con todo el historial.

### Ajustar la política

Edita las constantes al inicio de `lib/gemini.ts`:

```ts
const INTENTOS_POR_MODELO = 3;
const DELAYS_MS = [2000, 4000, 8000];
const TIMEOUT_MS = 50_000;
```

### ⚠️ Límite de tiempo en Vercel

La ruta declara `maxDuration = 300` (5 min). En el **plan Hobby**, Vercel recorta a 60 s, lo cual puede ser insuficiente si caen varios modelos seguidos. Opciones:

1. Pasar a plan **Pro** (300 s por función).
2. Reducir `INTENTOS_POR_MODELO` a 2 y bajar los delays.
3. Desplegar en otro host sin límite estricto (Fly.io, Railway, VPS propio).

## Despliegue en Vercel

```bash
vercel deploy
```

No requiere variables de entorno en el servidor: la API key la introduce el usuario final en el formulario.

## Modelos disponibles

`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`.

Selecciona el más potente si el material es muy denso.

## Estructura del proyecto

- `app/api/generate` → parsea el archivo y llama a Gemini.
- `lib/parser.ts` → extrae texto de DOCX/PDF/PPTX/MD.
- `lib/prompts.ts` → instrucciones del sistema (formato de los apuntes).
- `lib/gemini.ts` → llamada al endpoint de Gemini + reintentos + fallback.
- `lib/schema.ts` → validación con Zod de la estructura JSON.
- `lib/docx-generator.ts` → construcción del `.docx` con estilos.
- `components/` → formulario y previsualización.

## Personalización del formato

Toda la "personalidad" del documento (colores, cajas, tablas, ideas clave) está en:

1. `lib/prompts.ts` → reglas de contenido y estructura.
2. `lib/docx-generator.ts` → estilos visuales (colores, bordes, tamaños).

Puedes ajustar ahí sin tocar el resto del código.

## Instrucciones del profesor (recuadro)

El paso 4 del formulario es un recuadro de texto libre. Lo que escribas ahí se inyecta en el prompt como un bloque de prioridad alta:

```
=== INSTRUCCIONES DEL PROFESOR (prioridad alta) ===
4 apartados. Prioriza tablas comparativas. Tono formal. 2ª persona.
```

Ejemplos de uso:

| Objetivo | Instrucción |
| --- | --- |
| Estilo de examen | `Redacta como si fueran apuntes de examen: incluye el enunciado de la "preguntas de repaso" al final de cada apartado.` |
| Extensión | `Muy resumido: máximo 2 apartados, párrafos de 30 palabras.` |
| Reorganización | `Reordena el material por bloques temáticos, no por el orden del original.` |
| Foco | `Haz una tabla comparativa con los 3 métodos de evaluación de impacto.` |

También puedes **adjuntar un `.md` o `.txt`** con la guía. Su contenido se concatena al de lo escrito y se envía junto. El archivo se lee en el navegador (no se sube como material).

Reglas de la función:

- El bloque del profesor **tiene prioridad sobre las reglas de estilo** del sistema (nº de apartados, extensión de párrafos, nº de tablas, tono, nº de preguntas de repaso).
- Las reglas de **formato JSON** (esquema de bloques, tipografías `idea_clave` / `caja_enfasis`, etc.) y la de **citas** no se pueden anular: si el profesor pide algo incompatible, la IA lo descarta y avisa.
- Tope: 6000 caracteres (texto + archivo). El contador bajo el recuadro indica el consumo.
- Si no escribes nada ni adjuntas archivo, el bloque no se incluye: el prompt queda idéntico al original.

## Puesta en marcha

```bash
npx create-next-app@latest apuntes-ia --typescript --tailwind --app --no-src-dir
cd apuntes-ia
# Sustituye los archivos por los del bloque anterior
npm install docx mammoth jszip unpdf zod
npm run dev
```

Abre `http://localhost:3000`, sube un PPTX de prueba, pega tu API key y descarga el Word. El `.docx` generado tendrá:

- Título centrado
- Índice automático de apartados
- Cajas verdes `IDEA CLAVE` con borde lateral grueso
- Cajas azules/amarillas de énfasis
- Tablas con cabecera sombreada
- Fórmulas centradas con fondo gris
- Definiciones con sangría y borde izquierdo
- Preguntas de repaso numeradas
- Referencias en APA simplificado