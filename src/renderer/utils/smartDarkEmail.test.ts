import { describe, expect, it } from 'vitest';
import { adaptHtmlForDark, adaptTextColor, isSimpleEmailHtml, parseCssColor } from './smartDarkEmail';

describe('cores', () => {
  it('lê hex, rgb e nomes', () => {
    expect(parseCssColor('#000')).toEqual([0, 0, 0]);
    expect(parseCssColor('#1F2937')).toEqual([31, 41, 55]);
    expect(parseCssColor('rgb(255, 255, 255)')).toEqual([255, 255, 255]);
    expect(parseCssColor('navy')).toEqual([0, 0, 128]);
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('rgba(0,0,0,0)')).toBeNull();
  });
  it('clareia só cores escuras', () => {
    expect(adaptTextColor('#000000')).toBe('#e5e7eb');
    expect(adaptTextColor('#333')).toBe('#e5e7eb');
    expect(adaptTextColor('#ffcc00')).toBe('#ffcc00'); // já clara
    const navy = parseCssColor(adaptTextColor('navy'))!;
    expect(navy[2]).toBeGreaterThan(200); // azul-marinho vira azul claro
  });
});

describe('e-mail simples ou elaborado', () => {
  it('texto, listas e links: simples', () => {
    expect(isSimpleEmailHtml('<p>Olá Ana,</p><ul><li>Item</li></ul><p><a href="https://x.com">link</a></p>')).toBe(true);
    expect(isSimpleEmailHtml('<div style="color:#333;font-family:Arial">Bom dia</div>')).toBe(true);
    expect(isSimpleEmailHtml('<div style="background-color:#ffffff">texto</div>')).toBe(true);
  });
  it('newsletter, fundos coloridos e imagem de fundo: elaborado', () => {
    expect(isSimpleEmailHtml('<table width="600"><tr><td>Oferta</td></tr></table>')).toBe(false);
    expect(isSimpleEmailHtml('<td bgcolor="#0b3d91">Banco</td>')).toBe(false);
    expect(isSimpleEmailHtml('<div style="background:#f97316;padding:8px">Promo</div>')).toBe(false);
    expect(isSimpleEmailHtml('<div style="background-image:url(x.png)">x</div>')).toBe(false);
    expect(isSimpleEmailHtml('<table></table><table></table><table></table><table></table>')).toBe(false);
    expect(isSimpleEmailHtml('<img src=a><img src=b><img src=c><img src=d><img src=e>')).toBe(false);
  });
});

describe('adaptação para o tema escuro', () => {
  it('clareia texto escuro, tira fundo branco e mantém o resto', () => {
    const out = adaptHtmlForDark(
      '<div style="color:#000;background-color:#FFFFFF;font-size:14px"><font color="#1f2937">a</font><span style="color:#ffcc00">b</span></div><td bgcolor="#ffffff">c</td>'
    );
    expect(out).toContain('color: #e5e7eb');
    expect(out).toContain('background-color: transparent');
    expect(out).toContain('font-size:14px');
    expect(out).toContain('color="#e5e7eb"');
    expect(out).toContain('color: #ffcc00');
    expect(out).not.toMatch(/bgcolor/i);
  });
});
