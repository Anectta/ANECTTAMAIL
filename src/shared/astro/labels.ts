/**
 * Astro Respostas Inteligentes — textos para a tela (travas, categorias, ações, autonomia).
 * Arquivo leve (sem o motor), para a interface importar sem carregar a busca.
 */
import { MIN_APPROVED_DRAFTS_FOR_AUTO } from './replyConfig';
import type { AstroAutonomy } from './replyConfig';
import type { AstroAction, AstroTrigger } from './replyGuard';
import type { AstroCategory } from './categorize';

export const TRIGGER_LABELS: Record<AstroTrigger, string> = {
  desligado: 'Astro Respostas Inteligentes desligado nesta conta',
  pausado: 'envios automáticos pausados',
  autonomia: 'nível de autonomia escolhido',
  no_reply: 'remetente "não responda"',
  marketing: 'newsletter ou e-mail promocional',
  mensagem_automatica: 'mensagem automática',
  remetente_proprio: 'enviado por você mesmo',
  remetente_bloqueado: 'remetente bloqueado',
  golpe: 'possível golpe',
  fora_da_entrada: 'fora da Caixa de Entrada',
  anexo: 'tem anexo para conferir',
  grupo_cc: 'conversa em grupo (CC ou vários destinatários)',
  anti_loop: 'o Astro já respondeu automaticamente nesta conversa',
  temporal: 'e-mail antigo ou anterior à ativação',
  reply_to_suspeito: '"Responder para" suspeito',
  complexidade: 'resposta precisa ser pensada',
  confianca_baixa: 'confiança abaixo do mínimo',
  limite_diario: 'limite diário de envios atingido',
  vazamento: 'a resposta antiga tinha dados de outro cliente',
  sem_padrao: 'sem casos parecidos no seu histórico',
  historico_insuficiente: 'o Astro ainda está aprendendo com o seu histórico',
  aprovacoes_insuficientes: `envio automático liberado após ${MIN_APPROVED_DRAFTS_FOR_AUTO} rascunhos aprovados`,
};

export const CATEGORY_LABELS: Record<AstroCategory, string> = {
  pedido_informacao: 'Pedido de informação',
  agendamento: 'Agendamento',
  cobranca_pagamento: 'Cobrança / pagamento',
  confirmacao: 'Confirmação',
  agradecimento: 'Agradecimento',
  suporte: 'Suporte',
  comercial: 'Comercial',
  automatico: 'Automático',
  outro: 'Mensagem',
};

export const ACTION_LABELS: Record<AstroAction, string> = {
  enviar_automatico: 'Pronto para envio automático',
  salvar_rascunho: 'Rascunho sugerido',
  escalar_humano: 'Precisa da sua resposta',
  apenas_classificar: 'Apenas classificado',
};

export const AUTONOMY_OPTIONS: Array<{ value: AstroAutonomy; label: string; description: string }> = [
  { value: 'desligado', label: 'Desligado', description: 'O Astro não analisa nem aprende nesta conta.' },
  { value: 'classificar', label: 'Apenas classificar', description: 'Classifica os e-mails e mostra se precisam de você.' },
  { value: 'rascunho', label: 'Sugerir rascunho', description: 'Sugere respostas no seu estilo; você revisa e envia.' },
  {
    value: 'automatico',
    label: 'Envio automático',
    description: `Responde sozinho só casos simples e recorrentes. Liberado após ${MIN_APPROVED_DRAFTS_FOR_AUTO} rascunhos aprovados.`,
  },
];
