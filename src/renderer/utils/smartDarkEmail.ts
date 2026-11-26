/**
 * Modo escuro inteligente para e-mails.
 *
 * - isSimpleEmailHtml: decide se o e-mail é "simples" (texto, listas, links; sem fundos coloridos,
 *   imagem de fundo ou layout de tabelas largas). Só esses são adaptados ao tema escuro;
 *   newsletters, bancos, notas fiscais etc. continuam no fundo branco original.
 * - adaptHtmlForDark: clareia cores de texto escuras e remove fundos brancos/quase brancos.
 *
 * Funções puras (texto → texto), sem depender do navegador.
 */

type RGB = [number, number, number];

const NAMED: Record<string, RGB> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  silver: [192, 192, 192],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  whitesmoke: [245, 245, 245],
  navy: [0, 0, 128],
  darkblue: [0, 0, 139],
  blue: [0, 0, 255],
  red: [255, 0, 0],
  darkred: [139, 0, 0],
  maroon: [128, 0, 0],
  green: [0, 128, 0],
  darkgreen: [0, 100, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
};

export function parseCssColor(value: string | null | undefined): RGB | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/\s*!important\s*$/, '');
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor' || v === 'none') return null;
  if (NAMED[v]) return NAMED[v];
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as RGB;
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
    return null;
  }
  m = v.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a === 0) return null; // totalmente transparente
    }
    return [Number(m[1]), Number(m[2]), Number(m[3])].map((n) => Math.min(255, n)) as RGB;
  }
  return null;
}

/** Luminância relativa (0 = preto, 1 = branco). */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const isNearWhite = (rgb: RGB) => luminance(rgb) > 0.85;
const toHex = (rgb: RGB) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** Cor de texto legível no fundo escuro: cores escuras ficam claras; cores claras não mudam. */
export function adaptTextColor(value: string): string {
  const rgb = parseCssColor(value);
  if (!rgb) return value;
  if (luminance(rgb) >= 0.18) return value; // já é clara o suficiente
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  if (max - min < 40) return '#e5e7eb'; // preto/cinza → cinza bem claro
  return toHex(rgb.map((c) => c + (255 - c) * 0.6) as RGB); // cor escura → mesma cor, mais clara
}

const STYLE_ATTR_RE = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi;
const BG_DECL_RE = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/gi;

/** O e-mail é simples o bastante para ser mostrado na cor do tema escuro? */
export function isSimpleEmailHtml(html: string): boolean {
  if (!html) return true;
  // Imagem de fundo
  if (/background-image\s*:|background\s*:[^;"']*url\(|\bbackground\s*=\s*["'][^"']+["']/i.test(html)) return false;
  // Fundos coloridos (atributo bgcolor ou estilo background) que não são brancos
  for (const m of html.matchAll(/\bbgcolor\s*=\s*["']?([#\w(),.\s]+?)["'\s>]/gi)) {
    const rgb = parseCssColor(m[1]);
    if (rgb && !isNearWhite(rgb)) return false;
  }
  for (const s of html.matchAll(STYLE_ATTR_RE)) {
    const style = s[2] ?? s[3] ?? '';
    for (const d of style.matchAll(BG_DECL_RE)) {
      const rgb = parseCssColor(d[1].split(/\s+(?![^(]*\))/)[0]);
      if (rgb && !isNearWhite(rgb)) return false;
    }
  }
  // Layout de newsletter: muitas tabelas ou tabelas largas
  const tables = (html.match(/<table\b/gi) || []).length;
  if (tables > 3) return false;
  for (const t of html.matchAll(/<table\b[^>]*>/gi)) {
    const w = t[0].match(/\bwidth\s*=\s*["']?(\d{3,})/i) || t[0].match(/width\s*:\s*(\d{3,})px/i);
    if (w && Number(w[1]) >= 500) return false;
  }
  // Muitas imagens
  if ((html.match(/<img\b/gi) || []).length > 4) return false;
  return true;
}

/** Adapta as cores de um e-mail simples para o fundo escuro do tema. */
export function adaptHtmlForDark(html: string): string {
  if (!html) return html;
  let out = html.replace(STYLE_ATTR_RE, (_full, _q, dq: string | undefined, sq: string | undefined) => {
    const style = dq ?? sq ?? '';
    const next = style
      .replace(/(^|;)(\s*)color\s*:\s*([^;]+)/gi, (_m, pre: string, sp: string, val: string) => `${pre}${sp}color: ${adaptTextColor(val.trim())}`)
      .replace(/(^|;)(\s*)(background(?:-color)?)\s*:\s*([^;]+)/gi, (m, pre: string, sp: string, prop: string, val: string) => {
        const rgb = parseCssColor(val.trim().split(/\s+(?![^(]*\))/)[0]);
        return rgb && isNearWhite(rgb) ? `${pre}${sp}${prop}: transparent` : m;
      });
    return `style="${next.replace(/"/g, "'")}"`;
  });
  // <font color="..."> e similares
  out = out.replace(/\bcolor\s*=\s*(["'])([^"']+)\1/gi, (_m, q: string, val: string) => `color=${q}${adaptTextColor(val)}${q}`);
  // bgcolor branco → sem fundo
  out = out.replace(/\sbgcolor\s*=\s*(["']?)([#\w]+)\1/gi, (m, _q: string, val: string) => {
    const rgb = parseCssColor(val);
    return rgb && isNearWhite(rgb) ? '' : m;
  });
  return out;
}
