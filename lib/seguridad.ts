/* Controles de seguridad puros (sin dependencias): saneado de nombres,
 * rate-limit best-effort por IP y allowlist de URLs. Testeable en Node. */

export function sanearNombreSubida(nombre: string, fallback = "archivo"): string {
  const base = (nombre.split(/[\\/]/).pop() ?? "").trim();
  const limpio = base
    .replace(/[<>:"|?*\u0000-\u001F\u007F]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return limpio || fallback;
}

export type Limitador = {
  peticiones: Map<string, number[]>;
  ventanaMs: number;
  max: number;
};

export function crearLimitador(
  max = 8,
  ventanaMs = 10 * 60 * 1000
): Limitador {
  return { peticiones: new Map(), ventanaMs, max };
}

/** Best-effort por instancia (el serverless no comparte memoria entre
 *  instancias; para un límite estricto usar Vercel Firewall o KV). */
export function superaLimite(
  lim: Limitador,
  ip: string,
  ahora = Date.now()
): { limitado: boolean; reintentoSegs?: number } {
  // Evita crecimiento sin cota del mapa.
  if (lim.peticiones.size > 5000) {
    const primera = lim.peticiones.keys().next().value as string | undefined;
    if (primera !== undefined) lim.peticiones.delete(primera);
  }
  const lista = (lim.peticiones.get(ip) ?? []).filter(
    (t) => ahora - t < lim.ventanaMs
  );
  if (lista.length >= lim.max) {
    return {
      limitado: true,
      reintentoSegs: Math.max(
        1,
        Math.ceil((lista[0] + lim.ventanaMs - ahora) / 1000)
      ),
    };
  }
  lista.push(ahora);
  lim.peticiones.set(ip, lista);
  return { limitado: false };
}

/** Solo http(s); nada de javascript:, data:, etc. */
export function sanearUrlReferencia(url?: string): string | undefined {
  if (!url) return undefined;
  const u = url.trim().slice(0, 500);
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : undefined;
}
