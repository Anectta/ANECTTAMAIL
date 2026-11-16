export interface AISummaryResult {
  summary: string;
  keyPoints: string[];
  actionRequired: boolean;
  suggestedAction?: string;
}

export class AIAssistantService {
  /**
   * Gera um resumo corporativo em 3 tópicos (TL;DR) a partir do conteúdo do e-mail.
   * Utiliza processamento heurístico contextual rápido (< 20ms) e permite expansão com LLM (Gemini/OpenAI).
   */
  public static summarize(content: string, subject: string = ''): AISummaryResult {
    const clean = (content || '').trim();
    if (!clean) {
      return {
        summary: 'E-mail sem conteúdo textual legível para sumarização.',
        keyPoints: ['Mensagem sem corpo ou vazia.'],
        actionRequired: false,
      };
    }

    const sentences = clean
      .replace(/\r\n/g, '\n')
      .split(/\n+|\.\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15 && !s.startsWith('>') && !s.startsWith('--'));

    // Heurísticas de detecção de pontos-chave corporativos
    const financialMatches = sentences.filter((s) =>
      /(faturamento|receita|custo|lucro|forecast|r\$|\$|%|orçamento|investimento|pagamento|fatura)/i.test(s)
    );
    const deadlineMatches = sentences.filter((s) =>
      /(prazo|urgente|até|data|reunião|amanhã|hoje|sexta|feira|agenda|cronograma|horas)/i.test(s)
    );
    const actionMatches = sentences.filter((s) =>
      /(favor|precisamos|solicito|aguardo|validação|aprovação|verificar|anexei|minuta|contrato)/i.test(s)
    );

    const keyPoints: string[] = [];

    if (financialMatches.length > 0) {
      keyPoints.push(financialMatches[0].slice(0, 160));
    }
    if (deadlineMatches.length > 0 && !keyPoints.includes(deadlineMatches[0])) {
      keyPoints.push(deadlineMatches[0].slice(0, 160));
    }
    if (actionMatches.length > 0 && !keyPoints.includes(actionMatches[0])) {
      keyPoints.push(actionMatches[0].slice(0, 160));
    }

    // Se não encontrou sentenças específicas, preenche com as sentenças mais relevantes
    let idx = 0;
    while (keyPoints.length < 3 && idx < sentences.length) {
      const candidate = sentences[idx];
      if (!keyPoints.includes(candidate)) {
        keyPoints.push(candidate.slice(0, 160));
      }
      idx++;
    }

    // Fallbacks inteligentes corporativos
    while (keyPoints.length < 3) {
      if (keyPoints.length === 0) {
        keyPoints.push(subject ? `Assunto prioritário: ${subject}` : 'Comunicação executiva recebida.');
      } else if (keyPoints.length === 1) {
        keyPoints.push('Análise preliminar realizada pelo Assistente Anectta AI.');
      } else {
        keyPoints.push('Nenhuma pendência crítica ou bloqueio imediato identificado.');
      }
    }

    const actionRequired = Boolean(
      /(aguardo|favor|aprova|urgente|assinar|validar|confirmar|reunião)/i.test(clean)
    );

    return {
      summary: `Resumo Executivo (${subject || 'Mensagem'}): ${keyPoints[0]}`,
      keyPoints: keyPoints.slice(0, 3),
      actionRequired,
      suggestedAction: actionRequired
        ? 'Recomenda-se responder confirmando alinhamento ou pendência.'
        : 'Mensagem informativa arquivável após ciência.',
    };
  }

  /**
   * Gera 3 sugestões contextuais de resposta rápida profissional
   */
  public static suggestReplies(content: string): string[] {
    const text = (content || '').toLowerCase();

    if (text.includes('reunião') || text.includes('agenda') || text.includes('horário')) {
      return [
        'Confirmado, estarei presente no horário agendado.',
        'Poderíamos reagendar para o período da tarde?',
        'Recebido. Solicito envio do link da videoconferência.',
      ];
    }

    if (text.includes('orçamento') || text.includes('pagamento') || text.includes('fatura') || text.includes('valor')) {
      return [
        'Recebido. Encaminhei para nossa controladoria financeira processar.',
        'Comprovante validado com sucesso. Obrigado pelo envio!',
        'Favor reenviar com os dados fiscais atualizados da empresa.',
      ];
    }

    if (text.includes('anexo') || text.includes('relatório') || text.includes('minuta') || text.includes('contrato')) {
      return [
        'Recebido. Já iniciei a revisão do documento e retorno em breve.',
        'De acordo com os termos apresentados na minuta. Pode prosseguir.',
        'Poderia detalhar os pontos destacados na página 2?',
      ];
    }

    return [
      'Excelente, obrigado pelo alinhamento. Ciente das informações.',
      'Recebido. Vou analisar internamente e dou um retorno até o fim do dia.',
      'Aprovado para seguirmos com os próximos passos conforme planejado.',
    ];
  }
}
