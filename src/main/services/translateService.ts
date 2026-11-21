export interface TranslateResult {
  success: boolean;
  translatedText?: string;
  detectedLang?: string;
  targetLang: string;
  provider?: string;
  error?: string;
}

function splitTextIntoChunks(text: string, maxLen = 1400): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current ? current.length + 2 : 0) + para.length <= maxLen) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      if (current) {
        chunks.push(current);
        current = '';
      }
      if (para.length <= maxLen) {
        current = para;
      } else {
        // Split very long paragraph by sentences or hard limit
        let remaining = para;
        while (remaining.length > maxLen) {
          let cut = remaining.lastIndexOf('. ', maxLen);
          if (cut < maxLen * 0.4) cut = remaining.lastIndexOf(' ', maxLen);
          if (cut < maxLen * 0.4) cut = maxLen;
          else cut += 1;
          chunks.push(remaining.slice(0, cut).trim());
          remaining = remaining.slice(cut).trim();
        }
        if (remaining) current = remaining;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunkGoogleGtx(
  chunk: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<{ text: string; detectedLang?: string }> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sourceLang)}` +
    `&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t&q=${encodeURIComponent(chunk)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnecttaMail/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data: any = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Resposta inválida do serviço de tradução');
  }

  const translated = data[0]
    .map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('');

  const detectedLang = typeof data[2] === 'string' ? data[2] : undefined;
  return { text: translated, detectedLang };
}

async function translateChunkMyMemory(
  chunk: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<{ text: string; detectedLang?: string }> {
  const sl = sourceLang === 'auto' ? 'en' : sourceLang;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    chunk.slice(0, 480)
  )}&langpair=${encodeURIComponent(`${sl}|${targetLang}`)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const translated = data?.responseData?.translatedText;
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new Error('Falha no fallback de tradução');
  }
  return { text: translated, detectedLang: sl };
}

export class TranslateService {
  /**
   * Translates email text into targetLang (e.g. 'pt', 'en', 'es', 'fr', 'de', 'it').
   * Uses chunked translation with automatic fallback.
   */
  public static async translate(params: {
    text: string;
    targetLang: string;
    sourceLang?: string;
  }): Promise<TranslateResult> {
    const targetLang = (params.targetLang || 'pt').trim().toLowerCase();
    const sourceLang = (params.sourceLang || 'auto').trim().toLowerCase();
    const raw = (params.text || '').trim().slice(0, 14000);

    if (!raw) {
      return {
        success: false,
        targetLang,
        error: 'Nenhum conteúdo textual disponível para traduzir.',
      };
    }

    const chunks = splitTextIntoChunks(raw, 1400);
    let detectedLang: string | undefined;

    try {
      const translatedChunks: string[] = [];
      for (const chunk of chunks) {
        const res = await translateChunkGoogleGtx(chunk, targetLang, sourceLang);
        if (!detectedLang && res.detectedLang) detectedLang = res.detectedLang;
        translatedChunks.push(res.text);
      }
      return {
        success: true,
        translatedText: translatedChunks.join('\n\n'),
        detectedLang: detectedLang || sourceLang,
        targetLang,
        provider: 'google-gtx',
      };
    } catch {
      // Fallback: MyMemory
      try {
        const fallbackChunks: string[] = [];
        for (const chunk of chunks.slice(0, 4)) {
          const res = await translateChunkMyMemory(chunk, targetLang, sourceLang);
          if (!detectedLang && res.detectedLang) detectedLang = res.detectedLang;
          fallbackChunks.push(res.text);
        }
        return {
          success: true,
          translatedText: fallbackChunks.join('\n\n'),
          detectedLang: detectedLang || sourceLang,
          targetLang,
          provider: 'mymemory',
        };
      } catch (err: any) {
        return {
          success: false,
          targetLang,
          error:
            err?.message ||
            'Não foi possível traduzir agora. Verifique sua conexão com a internet.',
        };
      }
    }
  }
}
