/* Utilidades para convertir LaTeX del LLM en texto legible.
 * El LLM devuelve fórmulas como "t_e = \\frac{t_o + 4t_m + t_p}{6}".
 * Word (.docx vía librería `docx`) y la vista previa no renderizan LaTeX,
 * así que lo convertimos a segmentos con sub/superíndices nativos.
 */

export type SegmentoFormula = {
  texto: string;
  sub?: boolean;
  sup?: boolean;
};

const PLACEHOLDERS: Record<string, string> = {
  "\\_": "",
  "\\{": "",
  "\\}": "",
  "\\%": "",
  "\\&": "",
  "\\$": "",
  "\\#": "",
};

const RESTORE: Record<string, string> = {
  "": "_",
  "": "{",
  "": "}",
  "": "%",
  "": "&",
  "": "$",
  "": "#",
};

const COMANDOS_SIMPLES: Record<string, string> = {
  "\\times": "×",
  "\\cdot": "·",
  "\\cdotp": "·",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\leq": "≤",
  "\\le": "≤",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\sim": "∼",
  "\\simeq": "≃",
  "\\cong": "≅",
  "\\propto": "∝",
  "\\infty": "∞",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\supset": "⊃",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\rightarrow": "→",
  "\\to": "→",
  "\\Rightarrow": "⇒",
  "\\longrightarrow": "⟶",
  "\\leftarrow": "←",
  "\\gets": "←",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",
  "\\uparrow": "↑",
  "\\downarrow": "↓",
  "\\ldots": "…",
  "\\cdots": "⋯",
  "\\vdots": "⋮",
  "\\ddots": "⋱",
  "\\circ": "○",
  "\\bullet": "•",
  "\\prime": "′",
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\vartheta": "θ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\varpi": "π",
  "\\rho": "ρ",
  "\\varrho": "ρ",
  "\\sigma": "σ",
  "\\varsigma": "ς",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "φ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
  "\\sum": "Σ",
  "\\prod": "Π",
  "\\int": "∫",
  "\\oint": "∮",
  "\\sqrt": "√",
  "\\hbar": "ℏ",
  "\\ell": "ℓ",
  "\\Re": "ℜ",
  "\\Im": "ℑ",
  "\\aleph": "ℵ",
  "\\deg": "°",
  "\\perp": "⊥",
  "\\parallel": "∥",
  "\\angle": "∠",
};

function proteger(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(PLACEHOLDERS)) {
    out = out.split(k).join(v);
  }
  return out;
}

function restaurar(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(RESTORE)) {
    out = out.split(k).join(v);
  }
  return out;
}

/** Extrae el contenido de un grupo {…} balanceado a partir de `i` (s[i] === "{"). */
function extraerGrupo(s: string, i: number): { contenido: string; fin: number } {
  // i apunta a "{"
  let prof = 0;
  let j = i;
  for (; j < s.length; j++) {
    if (s[j] === "{") prof++;
    else if (s[j] === "}") {
      prof--;
      if (prof === 0) {
        return { contenido: s.slice(i + 1, j), fin: j };
      }
    }
  }
  return { contenido: s.slice(i + 1), fin: s.length - 1 };
}

/** Limpia comandos con estructura: \frac, \sqrt, \text, genéricos. Recursivo. */
function expandirEstructuras(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const resto = s.slice(i);

    const mFrac = resto.match(/^\\(d?frac|cfrac|tfrac)\s*/);
    if (mFrac) {
      i += mFrac[0].length;
      while (s[i] === " ") i++;
      if (s[i] === "{") {
        const a = extraerGrupo(s, i);
        i = a.fin + 1;
        while (s[i] === " ") i++;
        if (s[i] === "{") {
          const b = extraerGrupo(s, i);
          i = b.fin + 1;
          const num = expandirEstructuras(a.contenido.trim());
          const den = expandirEstructuras(b.contenido.trim());
          out += `(${num}) / (${den})`;
          continue;
        }
        out += `(${expandirEstructuras(a.contenido.trim())}) / (…)`;
        continue;
      }
      out += "/";
      continue;
    }

    const mSqrt = resto.match(/^\\sqrt\s*/);
    if (mSqrt) {
      i += mSqrt[0].length;
      // \sqrt[n]{x}
      if (s[i] === "[") {
        const cierre = s.indexOf("]", i);
        const indice = cierre >= 0 ? s.slice(i + 1, cierre) : "";
        i = cierre >= 0 ? cierre + 1 : i + 1;
        while (s[i] === " ") i++;
        if (s[i] === "{") {
          const g = extraerGrupo(s, i);
          i = g.fin + 1;
          const inner = expandirEstructuras(g.contenido.trim());
          out += indice.trim() ? `√[${indice.trim()}](${inner})` : `√(${inner})`;
          continue;
        }
        out += "√";
        continue;
      }
      if (s[i] === "{") {
        const g = extraerGrupo(s, i);
        i = g.fin + 1;
        out += `√(${expandirEstructuras(g.contenido.trim())})`;
        continue;
      }
      out += "√";
      continue;
    }

    const mText = resto.match(/^\\(text|mathrm|mathbf|mathit|boldsymbol|mathsf|mathtt|operatorname|overline|widehat|hat|bar|dot|ddot|vec)\s*/);
    if (mText) {
      i += mText[0].length;
      while (s[i] === " ") i++;
      if (s[i] === "{") {
        const g = extraerGrupo(s, i);
        i = g.fin + 1;
        out += expandirEstructuras(g.contenido);
        continue;
      }
      if (s[i] === "[") {
        const cierre = s.indexOf("]", i);
        i = cierre >= 0 ? cierre + 1 : i + 1;
        continue;
      }
      continue;
    }

    // Comando genérico \algo{contenido} → contenido (ej. \hat{x} → x).
    // No consumir el espacio posterior: en "\alpha +", ese espacio separa.
    const mGen = resto.match(/^\\[a-zA-Z]+/);
    if (mGen) {
      const cmd = mGen[0].trim();
      if (COMANDOS_SIMPLES[cmd] !== undefined) {
        out += COMANDOS_SIMPLES[cmd];
        i += mGen[0].length;
        continue;
      }
      i += mGen[0].length;
      // Saltar argumentos opcionales [..]
      while (s[i] === " ") i++;
      if (s[i] === "[") {
        const cierre = s.indexOf("]", i);
        i = cierre >= 0 ? cierre + 1 : i + 1;
        while (s[i] === " ") i++;
      }
      if (s[i] === "{") {
        const g = extraerGrupo(s, i);
        i = g.fin + 1;
        // Comando desconocido con argumento: conservar el contenido.
        out += expandirEstructuras(g.contenido);
        continue;
      }
      // Comando desconocido sin argumento: ignorar (p. ej. \left ya tratado).
      const ignorar = new Set([
        "\\left",
        "\\right",
        "\\big",
        "\\Big",
        "\\bigg",
        "\\Bigg",
        "\\,",
        "\\;",
        "\\:",
        "\\!",
        "\\quad",
        "\\qquad",
        "\\ ",
        "\\\\",
        "\\newline",
      ]);
      if (!ignorar.has(cmd)) {
        // Si parece un nombre de función (log, sin, cos), conservarlo.
        const nombre = cmd.slice(1);
        if (/^(sin|cos|tan|log|ln|exp|min|max|sup|inf)$/.test(nombre)) {
          out += nombre;
        }
      } else if (cmd === "\\\\") {
        out += " ";
      } else if (cmd === "\\ ") {
        out += " ";
      }
      continue;
    }

    out += s[i];
    i++;
  }
  return out;
}

function quitarDelimitadores(s: string): string {
  let t = s.trim();
  // Quitar cercas de código
  t = t.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "");
  // Entornos \begin{..}..\end{..}
  t = t.replace(/\\begin\{[^}]*\}/g, "").replace(/\\end\{[^}]*\}/g, "");
  // Delimitadores display/inline
  t = t.split("\\[").join("").split("\\]").join("");
  t = t.split("\\(").join("").split("\\)").join("");
  // $$..$$ y $..$
  t = t.replace(/\$\$/g, "");
  // Quitar $ sueltos (suelen ser delimitadores, no dólares en fórmulas)
  t = t.replace(/\$/g, "");
  // \\ como salto de línea → espacio
  t = t.replace(/\\\\/g, " ");
  // Espaciados LaTeX → espacio normal
  t = t.replace(/\\(,|;|:|!|\s)/g, " ");
  t = t.replace(/\\(quad|qquad)\b/g, " ");
  t = t.replace(/\\(left|right)\b/g, "");
  t = t.replace(/&(?!amp;)/g, " ");
  return t.trim();
}

/** Divide el texto limpio en segmentos con marcas sub/sup para _ y ^. */
function segmentarSubSup(s: string): SegmentoFormula[] {
  const segs: SegmentoFormula[] = [];
  let actual = "";
  let i = 0;

  const volcar = (texto: string, sub = false, sup = false) => {
    if (!texto) return;
    const ultimo = segs[segs.length - 1];
    if (
      ultimo &&
      !!ultimo.sub === sub &&
      !!ultimo.sup === sup
    ) {
      ultimo.texto += texto;
    } else {
      segs.push({ texto, ...(sub ? { sub: true } : {}), ...(sup ? { sup: true } : {}) });
    }
  };

  while (i < s.length) {
    const c = s[i];
    if (c === "_" || c === "^") {
      const esSub = c === "_";
      if (actual) {
        volcar(actual);
        actual = "";
      }
      i++;
      if (s[i] === "{") {
        const g = extraerGrupo(s, i);
        i = g.fin + 1;
        volcar(g.contenido, esSub, !esSub);
      } else if (i < s.length && s[i] !== " " && s[i] !== "_" && s[i] !== "^") {
        // Un solo carácter (p. ej. t_o, x^2), como en LaTeX real.
        volcar(s[i], esSub, !esSub);
        i++;
      } else {
        // "_" suelto → literal
        volcar(c);
      }
      continue;
    }
    actual += c;
    i++;
  }
  if (actual) volcar(actual);
  return segs;
}

/** Convierte segmentos a cadena Unicode (para contextos de texto plano). */
const SUB_MAP: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", i: "ᵢ",
  j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ",
  r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ",
};

const SUP_MAP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ",
  g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ",
  m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ",
  t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};

function aUnicodeConMapa(texto: string, mapa: Record<string, string>, envoltorio: (s: string) => string): string {
  let out = "";
  for (const ch of texto) {
    out += mapa[ch] ?? mapa[ch.toLowerCase()] ?? envoltorio(ch);
  }
  return out;
}

export function segmentosAUnicode(segs: SegmentoFormula[]): string {
  return segs
    .map((s) => {
      if (s.sub) return aUnicodeConMapa(s.texto, SUB_MAP, (c) => `₍${c}₎`);
      if (s.sup) return aUnicodeConMapa(s.texto, SUP_MAP, (c) => `⁽${c}⁾`);
      return s.texto;
    })
    .join("");
}

/** API principal: LaTeX crudo → segmentos listos para render. */
export function latexASegmentos(raw: string): SegmentoFormula[] {
  if (!raw || !raw.trim()) return [{ texto: "" }];
  const protegido = proteger(raw);
  const sinDelim = quitarDelimitadores(protegido);
  const expandido = expandirEstructuras(sinDelim);
  const conRestaurados = restaurar(expandido)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/ {2,}/g, " ")
    .trim();
  // Los placeholders restaurados "_" , "{" , "}" literales deben protegerse
  // de la segmentación: los marcamos de nuevo como literales.
  // Estrategia simple: segmentar y luego restaurar es suficiente porque
  // "\_" ya es "_" aislado; el segmentador lo trataría como sub solo si
  // va seguido de carácter. Un "_" literal suele ir aislado o escapado
  // en contexto de texto, lo aceptamos como "_" literal si está solo.
  const segs = segmentarSubSup(conRestaurados);
  return segs.length ? segs : [{ texto: conRestaurados }];
}

/** API de conveniencia: LaTeX crudo → cadena legible con Unicode. */
export function latexAUnicode(raw: string): string {
  return segmentosAUnicode(latexASegmentos(raw));
}

/** Limpia LaTeX para comprobaciones/logs (sin segmentación). */
export function limpiarLatex(raw: string): string {
  return latexAUnicode(raw);
}
