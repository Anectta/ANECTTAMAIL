/** Tipo dos dados ao arrastar e-mails da lista para uma pasta da barra lateral (JSON com os ids). */
export const EMAIL_DRAG_MIME = 'application/x-anectta-emails';

/** Pastas que aceitam e-mails soltos por arraste (as demais são virtuais ou especiais). */
export const DROPPABLE_SYSTEM_FOLDERS = ['inbox', 'sent', 'junk', 'trash', 'archive'] as const;
