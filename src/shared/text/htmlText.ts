/**
 * Limpeza de texto de e-mails, compartilhada entre o Astro (resumo) e o Astro Respostas
 * Inteligentes. TypeScript puro: sem Electron, sem Node — pode rodar também no app Android.
 */
/**
 * Tira os "espaços invisíveis" que e-mails de divulgação usam para encher a prévia
 * (&#8199;&#847;, &zwnj;, zero-width etc.): decodifica códigos numéricos e remove os invisíveis.
 */
export function cleanInvisible(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_m, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});?/g, (_m, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&(zwnj|zwj|shy|lrm|rlm);/gi, '')
    .replace(/&(ensp|emsp|thinsp|nbsp);/gi, ' ')
    .replace(/[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁤⁪-⁯﻿ㅤﾠ]/g, '')
    .replace(/[  -   　]/g, ' ');
}
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Converte HTML em texto simples (sem scripts/estilos). */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style)\b[\s\S]*$/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ');
}

// Seletor CSS curto (uma "palavra", sem espaços, ou lista separada por vírgulas): body, *, .x, a:hover, td.y
const CSS_SEL = String.raw`(?:\*|[#.]?[A-Za-z_][\w-]*(?:[.#:]{1,2}[\w-]+)*)`;
const CSS_RULE_RE = new RegExp(
  String.raw`${CSS_SEL}(?:\s*,\s*${CSS_SEL})*\s*\{\s*(?:[\w-]+\s*:[^{};]*;?\s*)+\}`,
  'g'
);

/**
 * Remove regras CSS que vazaram para o texto do e-mail (ex.: versão texto gerada a partir
 * do HTML sem tirar o <style>): "* { box-sizing: border-box; } body { font-family: Arial }".
 */
export function stripCss(text: string): string {
  if (!/\{[^{}]*:[^{}]*\}/.test(text)) return text;
  let t = text;
  for (let i = 0; i < 3; i++) {
    const next = t
      .replace(CSS_RULE_RE, ' ')
      .replace(/@[\w-]+[^{}]{0,200}\{\s*\}/g, ' ');
    if (next === t) break;
    t = next;
  }
  return t.replace(/[ \t]{2,}/g, ' ');
}
