import React, { useEffect, useRef, useState } from 'react';
import {
  PenLine,
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  RemoveFormatting,
  Image as ImageIcon,
  Link2,
  Code2,
  Sparkles,
  X,
  Check,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { AccountSettings, EmailSignature } from '@/types/settings';

interface SignatureEditorPanelProps {
  signatures: EmailSignature[];
  accounts: AccountSettings[];
  attachVCard: boolean;
  onChangeSignatures: (signatures: EmailSignature[]) => void;
  onToggleAttachVCard: (checked: boolean) => void;
}

const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
];

const FONT_SIZES: Array<{ label: string; cmdValue: string }> = [
  { label: '10', cmdValue: '1' },
  { label: '11', cmdValue: '2' },
  { label: '12', cmdValue: '3' },
  { label: '14', cmdValue: '4' },
  { label: '16', cmdValue: '5' },
  { label: '18', cmdValue: '6' },
  { label: '24', cmdValue: '7' },
];

type GeneratorTemplate = 'classic' | 'modern' | 'minimal';

function buildSignatureTemplateHtml(
  template: GeneratorTemplate,
  fields: {
    name: string;
    role: string;
    company: string;
    phone: string;
    email: string;
    website: string;
    accentColor: string;
  }
): string {
  const safeName = fields.name.trim() || 'Seu Nome';
  const safeRole = fields.role.trim();
  const safeCompany = fields.company.trim();
  const safePhone = fields.phone.trim();
  const safeEmail = fields.email.trim();
  const safeWebsite = fields.website.trim();
  const color = fields.accentColor || '#2563eb';

  const contactParts = [
    safePhone ? `<span>Tel: ${safePhone}</span>` : '',
    safeEmail
      ? `<a href="mailto:${safeEmail}" style="color:${color};text-decoration:none;">${safeEmail}</a>`
      : '',
    safeWebsite
      ? `<a href="${safeWebsite.startsWith('http') ? safeWebsite : `https://${safeWebsite}`}" style="color:${color};text-decoration:none;">${safeWebsite}</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ');

  if (template === 'modern') {
    return `<table cellpadding="0" cellspacing="0" style="font-family:Inter,Arial,sans-serif;font-size:13px;border-collapse:collapse;">
  <tr>
    <td style="border-left:4px solid ${color};padding-left:12px;">
      <div style="font-size:15px;font-weight:700;">${safeName}</div>
      ${
        safeRole || safeCompany
          ? `<div style="font-size:12px;margin-top:2px;">${[safeRole, safeCompany].filter(Boolean).join(' • ')}</div>`
          : ''
      }
      ${contactParts ? `<div style="font-size:11px;margin-top:6px;">${contactParts}</div>` : ''}
    </td>
  </tr>
</table>`;
  }

  if (template === 'minimal') {
    return `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;">
  <strong>${safeName}</strong>${safeRole ? ` — ${safeRole}` : ''}${safeCompany ? `, ${safeCompany}` : ''}<br/>
  ${contactParts ? `<span style="font-size:11px;">${contactParts}</span>` : ''}
</div>`;
  }

  return `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;">
  <div style="font-weight:700;font-size:14px;">${safeName}</div>
  ${safeRole ? `<div style="font-size:12px;">${safeRole}</div>` : ''}
  ${safeCompany ? `<div style="font-size:12px;font-weight:600;">${safeCompany}</div>` : ''}
  ${contactParts ? `<div style="font-size:11px;margin-top:4px;">${contactParts}</div>` : ''}
</div>`;
}

export const SignatureEditorPanel: React.FC<SignatureEditorPanelProps> = ({
  signatures,
  accounts,
  attachVCard,
  onChangeSignatures,
  onToggleAttachVCard,
}) => {
  const [selectedId, setSelectedId] = useState<string>(signatures[0]?.id || '');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize, setFontSize] = useState('11');
  const [textColor, setTextColor] = useState('#e2e8f0');
  const [highlightColor, setHighlightColor] = useState('#fef08a');
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  const activeAccount = accounts[0];
  const [genTemplate, setGenTemplate] = useState<GeneratorTemplate>('modern');
  const [genFields, setGenFields] = useState({
    name: activeAccount?.displayName || '',
    role: activeAccount?.role || '',
    company: activeAccount?.organization || '',
    phone: '',
    email: activeAccount?.email || '',
    website: '',
    accentColor: activeAccount?.color || '#2563eb',
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastLoadedSignatureIdRef = useRef<string | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  const saveEditorSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedSelectionRef.current && editor.contains(savedSelectionRef.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    } else if (!sel.rangeCount || !editor.contains(sel.anchorNode) || sel.isCollapsed) {
      // Se nenhum trecho específico foi selecionado, aplica em toda a assinatura
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgOverlayRect, setImgOverlayRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [imgWidthValue, setImgWidthValue] = useState<number>(0);
  const [isResizingImg, setIsResizingImg] = useState(false);
  const [isMovingImg, setIsMovingImg] = useState(false);

  const selectedSignature =
    signatures.find((s) => s.id === selectedId) || signatures[0] || null;

  useEffect(() => {
    if (!selectedSignature && signatures.length > 0) {
      setSelectedId(signatures[0].id);
    }
  }, [signatures, selectedSignature]);

  // Sync contentEditable only when switching selected signature or exiting HTML mode
  useEffect(() => {
    if (!editorRef.current || !selectedSignature || isHtmlMode) return;
    if (lastLoadedSignatureIdRef.current !== selectedSignature.id) {
      editorRef.current.innerHTML = selectedSignature.html || '';
      lastLoadedSignatureIdRef.current = selectedSignature.id;
      setSelectedImg(null);
      setImgOverlayRect(null);
    }
  }, [selectedSignature, isHtmlMode]);

  useEffect(() => {
    if (isHtmlMode) {
      setSelectedImg(null);
      setImgOverlayRect(null);
    }
  }, [isHtmlMode]);

  const updateImgOverlay = (img: HTMLImageElement | null) => {
    if (!img || !editorWrapperRef.current || !editorRef.current?.contains(img)) {
      setImgOverlayRect(null);
      return;
    }
    const imgRect = img.getBoundingClientRect();
    const wrapperRect = editorWrapperRef.current.getBoundingClientRect();
    setImgOverlayRect({
      top: imgRect.top - wrapperRect.top,
      left: imgRect.left - wrapperRect.left,
      width: imgRect.width,
      height: imgRect.height,
    });
    setImgWidthValue(Math.round(imgRect.width));
  };

  useEffect(() => {
    if (!selectedImg) {
      setImgOverlayRect(null);
      return;
    }
    updateImgOverlay(selectedImg);
    const handleWindowResize = () => updateImgOverlay(selectedImg);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImg(null);
        setImgOverlayRect(null);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImg]);

  const updateSignature = (id: string, patch: Partial<EmailSignature>) => {
    const next = signatures.map((sig) => {
      if (sig.id === id) {
        return { ...sig, ...patch };
      }
      // Ensure each account has at most one default signature
      if (patch.defaultAccountId && patch.defaultAccountId !== '' && sig.defaultAccountId === patch.defaultAccountId) {
        return { ...sig, defaultAccountId: '' };
      }
      return sig;
    });
    onChangeSignatures(next);
  };

  const handleAddSignature = () => {
    const newSig: EmailSignature = {
      id: `sig-${Date.now()}`,
      name: 'Sem título',
      defaultAccountId: '',
      html: '',
    };
    onChangeSignatures([...signatures, newSig]);
    setSelectedId(newSig.id);
    lastLoadedSignatureIdRef.current = null;
  };

  const handleDuplicateSignature = (sig: EmailSignature) => {
    const copy: EmailSignature = {
      id: `sig-${Date.now()}`,
      name: `${sig.name || 'Sem título'} (cópia)`,
      defaultAccountId: '',
      html: sig.html,
    };
    onChangeSignatures([...signatures, copy]);
    setSelectedId(copy.id);
    setOpenMenuId(null);
    lastLoadedSignatureIdRef.current = null;
  };

  const handleDeleteSignature = (id: string) => {
    setOpenMenuId(null);
    const sig = signatures.find((s) => s.id === id);
    if (!window.confirm(`Deseja realmente apagar a assinatura "${sig?.name || 'Sem título'}"?`)) {
      return;
    }
    if (signatures.length <= 1) {
      updateSignature(id, { name: 'Sem título', defaultAccountId: '', html: '' });
      if (editorRef.current) editorRef.current.innerHTML = '';
      return;
    }
    const filtered = signatures.filter((s) => s.id !== id);
    onChangeSignatures(filtered);
    if (selectedId === id && filtered[0]) {
      setSelectedId(filtered[0].id);
      lastLoadedSignatureIdRef.current = null;
    }
  };

  const syncEditorToState = () => {
    if (!editorRef.current || !selectedSignature) return;
    if (selectedImg && !editorRef.current.contains(selectedImg)) {
      setSelectedImg(null);
      setImgOverlayRect(null);
    }
    updateSignature(selectedSignature.id, { html: editorRef.current.innerHTML });
  };

  const applyImageWidth = (targetWidth: number, shouldSync = true) => {
    if (!selectedImg || !editorRef.current?.contains(selectedImg)) return;
    const clamped = Math.round(Math.max(12, Math.min(800, targetWidth)));
    selectedImg.style.width = `${clamped}px`;
    selectedImg.style.height = 'auto';
    selectedImg.style.maxWidth = '100%';
    selectedImg.setAttribute('width', String(clamped));
    selectedImg.removeAttribute('height');
    updateImgOverlay(selectedImg);
    if (shouldSync) {
      syncEditorToState();
    }
  };

  const resetImageToOriginal = () => {
    if (!selectedImg || !editorRef.current?.contains(selectedImg)) return;
    selectedImg.style.removeProperty('width');
    selectedImg.style.height = 'auto';
    selectedImg.style.maxWidth = '100%';
    selectedImg.removeAttribute('width');
    selectedImg.removeAttribute('height');
    updateImgOverlay(selectedImg);
    syncEditorToState();
  };

  const handleRemoveSelectedImage = () => {
    if (!selectedImg || !editorRef.current?.contains(selectedImg)) return;
    selectedImg.remove();
    setSelectedImg(null);
    setImgOverlayRect(null);
    syncEditorToState();
  };

  const startImageResize = (
    corner: 'nw' | 'ne' | 'sw' | 'se',
    e: React.MouseEvent
  ) => {
    if (!selectedImg) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = selectedImg.getBoundingClientRect().width;
    const isLeft = corner === 'nw' || corner === 'sw';
    setIsResizingImg(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = isLeft
        ? startX - moveEvent.clientX
        : moveEvent.clientX - startX;
      applyImageWidth(startWidth + deltaX, false);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsResizingImg(false);
      updateImgOverlay(selectedImg);
      syncEditorToState();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startImageMove = (img: HTMLImageElement, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedImg(img);
    updateImgOverlay(img);

    const startX = e.clientX;
    const startY = e.clientY;
    const prevLeft = parseFloat(img.style.marginLeft || '0') || 0;
    const prevTop = parseFloat(img.style.marginTop || '0') || 0;
    let moved = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      setIsMovingImg(true);
      img.style.position = 'relative';
      img.style.marginLeft = `${Math.max(0, Math.round(prevLeft + dx))}px`;
      img.style.marginTop = `${Math.round(prevTop + dy)}px`;
      updateImgOverlay(img);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (moved) {
        setIsMovingImg(false);
        updateImgOverlay(img);
        syncEditorToState();
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const alignSelectedImage = (align: 'left' | 'center' | 'right') => {
    if (!selectedImg || !editorRef.current?.contains(selectedImg)) return;
    selectedImg.style.display = 'block';
    if (align === 'left') {
      selectedImg.style.marginLeft = '0px';
      selectedImg.style.marginRight = 'auto';
    } else if (align === 'center') {
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = 'auto';
    } else {
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = '0px';
    }
    updateImgOverlay(selectedImg);
    syncEditorToState();
  };

  const execCommand = (command: string, value?: string) => {
    restoreEditorSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    saveEditorSelection();
    syncEditorToState();
  };

  const handleInsertImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl && editorRef.current) {
        editorRef.current.focus();
        document.execCommand(
          'insertHTML',
          false,
          `<img src="${dataUrl}" alt="Assinatura" style="max-width:240px;height:auto;display:inline-block;" />`
        );
        syncEditorToState();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInsertLink = () => {
    const rawUrl = linkUrl.trim();
    if (!rawUrl) return;
    const href = /^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('mailto:') ? rawUrl : `https://${rawUrl}`;
    const label = linkText.trim() || rawUrl;
    editorRef.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline;">${label}</a>`
    );
    syncEditorToState();
    setLinkUrl('');
    setLinkText('');
    setIsLinkPopoverOpen(false);
  };

  const handleApplyGeneratedTemplate = () => {
    if (!selectedSignature) return;
    const generatedHtml = buildSignatureTemplateHtml(genTemplate, genFields);
    updateSignature(selectedSignature.id, {
      name:
        selectedSignature.name === 'Sem título' && genFields.name.trim()
          ? genFields.name.trim()
          : selectedSignature.name,
      html: generatedHtml,
    });
    if (editorRef.current && !isHtmlMode) {
      editorRef.current.innerHTML = generatedHtml;
    }
    setIsGeneratorOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left Sidebar: Saved Signatures */}
        <div className="w-full md:w-52 shrink-0 space-y-2.5">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <PenLine className="w-4 h-4 text-brand-400" />
            <span>Assinaturas</span>
          </div>

          <div className="space-y-1">
            {signatures.map((sig) => {
              const isSelected = selectedSignature?.id === sig.id;
              return (
                <div
                  key={sig.id}
                  className={`relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(sig.id);
                      setOpenMenuId(null);
                    }}
                    className="flex-1 text-left truncate pr-2"
                  >
                    {sig.name.trim() || 'Sem título'}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId((prev) => (prev === sig.id ? null : sig.id));
                    }}
                    className="p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white shrink-0"
                    title="Opções da assinatura"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {openMenuId === sig.id && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-30 text-xs text-slate-200">
                      <button
                        type="button"
                        onClick={() => handleDuplicateSignature(sig)}
                        className="w-full flex items-center space-x-2 px-3 py-1.5 text-left hover:bg-brand-500/15"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Duplicar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSignature(sig.id)}
                        className="w-full flex items-center space-x-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddSignature}
            className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar assinatura</span>
          </button>

          {/* Gerador rápido de assinatura (abaixo do botão Adicionar) */}
          <div className="pt-3 mt-1 border-t border-slate-800/80 space-y-2">
            <h4 className="text-sm font-semibold text-white leading-snug">
              Crie uma assinatura de e-mail em segundos
            </h4>
            <p className="text-xs text-slate-400">
              Eleve seu e-mail e sua marca. Nossa ferramenta de assinatura ajudará você a criar assinaturas profissionais e atraentes em poucos cliques.
            </p>
            <button
              type="button"
              onClick={() => setIsGeneratorOpen((prev) => !prev)}
              className="w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isGeneratorOpen ? 'Fechar Gerador' : 'Abrir Gerador de Assinatura'}</span>
            </button>

            {isGeneratorOpen && (
              <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-medium">Modelo:</span>
                  {(
                    [
                      { id: 'modern', label: 'Moderno' },
                      { id: 'classic', label: 'Clássico' },
                      { id: 'minimal', label: 'Minimalista' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setGenTemplate(t.id)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                        genTemplate === t.id
                          ? 'bg-brand-600 text-white border-brand-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={genFields.name}
                    onChange={(e) => setGenFields({ ...genFields, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Cargo"
                    value={genFields.role}
                    onChange={(e) => setGenFields({ ...genFields, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Empresa"
                    value={genFields.company}
                    onChange={(e) => setGenFields({ ...genFields, company: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Telefone / WhatsApp"
                    value={genFields.phone}
                    onChange={(e) => setGenFields({ ...genFields, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={genFields.email}
                    onChange={(e) => setGenFields({ ...genFields, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Site (ex: anectta.com.br)"
                    value={genFields.website}
                    onChange={(e) => setGenFields({ ...genFields, website: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleApplyGeneratedTemplate}
                  className="w-full px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Aplicar Assinatura no Editor
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Editor Area */}
        {selectedSignature && (
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Nome da assinatura:
              </label>
              <input
                type="text"
                value={selectedSignature.name}
                onChange={(e) => updateSignature(selectedSignature.id, { name: e.target.value })}
                placeholder="Nome da assinatura"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Padrão para:
              </label>
              <select
                value={selectedSignature.defaultAccountId}
                onChange={(e) =>
                  updateSignature(selectedSignature.id, { defaultAccountId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">Nenhuma conta</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.email || acc.accountName || acc.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Rich Text Signature Editor (Fundo sempre da cor do skin escolhido) */}
            <div
              style={{
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              className="compose-message-canvas border rounded-xl overflow-hidden"
            >
              {isHtmlMode ? (
                <textarea
                  rows={9}
                  value={selectedSignature.html}
                  onChange={(e) => updateSignature(selectedSignature.id, { html: e.target.value })}
                  placeholder="Cole ou edite o HTML da assinatura..."
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                  }}
                  className="compose-message-field w-full p-3 text-xs font-mono focus:outline-none resize-y min-h-[210px]"
                />
              ) : (
                <div ref={editorWrapperRef} className="relative min-h-[210px] overflow-hidden">
                  {!selectedSignature.html && (
                    <div className="pointer-events-none absolute left-3.5 top-3 text-xs text-slate-500">
                      Desenhe sua assinatura aqui.
                    </div>
                  )}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncEditorToState}
                    onMouseUp={saveEditorSelection}
                    onKeyUp={saveEditorSelection}
                    onBlur={saveEditorSelection}
                    onScroll={() => {
                      if (selectedImg) updateImgOverlay(selectedImg);
                    }}
                    onMouseDown={(e) => {
                      if (e.target instanceof HTMLImageElement) {
                        startImageMove(e.target, e);
                      }
                    }}
                    onClick={(e) => {
                      if (e.target instanceof HTMLImageElement) {
                        e.preventDefault();
                        setSelectedImg(e.target);
                        updateImgOverlay(e.target);
                      } else if (selectedImg) {
                        setSelectedImg(null);
                        setImgOverlayRect(null);
                      }
                    }}
                    style={{ color: 'var(--text-primary)' }}
                    className="w-full min-h-[210px] max-h-[280px] overflow-y-auto p-3.5 text-xs focus:outline-none prose prose-sm max-w-none [&_img]:cursor-grab active:[&_img]:cursor-grabbing"
                  />

                  {/* Interactive Image Resize Overlay */}
                  {selectedImg && imgOverlayRect && (
                    <div
                      className="pointer-events-none absolute border-2 border-brand-500 rounded-sm z-20"
                      style={{
                        top: imgOverlayRect.top,
                        left: imgOverlayRect.left,
                        width: imgOverlayRect.width,
                        height: imgOverlayRect.height,
                      }}
                    >
                      {/* Corner resize handles */}
                      <div
                        onMouseDown={(e) => startImageResize('nw', e)}
                        title="Arraste para redimensionar"
                        className="pointer-events-auto absolute -top-1.5 -left-1.5 w-3 h-3 rounded-sm bg-brand-500 border border-white shadow cursor-nwse-resize"
                      />
                      <div
                        onMouseDown={(e) => startImageResize('ne', e)}
                        title="Arraste para redimensionar"
                        className="pointer-events-auto absolute -top-1.5 -right-1.5 w-3 h-3 rounded-sm bg-brand-500 border border-white shadow cursor-nesw-resize"
                      />
                      <div
                        onMouseDown={(e) => startImageResize('sw', e)}
                        title="Arraste para redimensionar"
                        className="pointer-events-auto absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-sm bg-brand-500 border border-white shadow cursor-nesw-resize"
                      />
                      <div
                        onMouseDown={(e) => startImageResize('se', e)}
                        title="Arraste para redimensionar"
                        className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-sm bg-brand-500 border border-white shadow cursor-nwse-resize"
                      />

                      {/* Live dimension badge */}
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-900/95 border border-slate-700 text-[10px] font-mono text-slate-200 shadow">
                        {Math.round(imgOverlayRect.width)} × {Math.round(imgOverlayRect.height)} px
                      </div>
                    </div>
                  )}

                  {(isResizingImg || isMovingImg) && (
                    <div
                      className={`fixed inset-0 z-50 ${
                        isMovingImg ? 'cursor-grabbing' : 'cursor-nwse-resize'
                      }`}
                    />
                  )}
                </div>
              )}

              {/* Contextual Image Resize & Move Bar */}
              {selectedImg && !isHtmlMode && (
                <div className="px-3 py-2 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                  <span className="font-medium text-brand-400 flex items-center gap-1">
                    <Move className="w-3.5 h-3.5" />
                    <span>Logo / Imagem (arraste para mover):</span>
                  </span>
                  <div className="flex items-center gap-1 border-r border-slate-700 pr-2">
                    <button
                      type="button"
                      onClick={() => alignSelectedImage('left')}
                      className="p-1 rounded bg-slate-950 border border-slate-700 hover:border-brand-500 text-slate-200"
                      title="Alinhar à esquerda"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedImage('center')}
                      className="p-1 rounded bg-slate-950 border border-slate-700 hover:border-brand-500 text-slate-200"
                      title="Centralizar"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedImage('right')}
                      className="p-1 rounded bg-slate-950 border border-slate-700 hover:border-brand-500 text-slate-200"
                      title="Alinhar à direita"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={16}
                    max={400}
                    value={Math.min(400, Math.max(16, imgWidthValue || 120))}
                    onChange={(e) => applyImageWidth(Number(e.target.value))}
                    className="w-24 accent-brand-500 cursor-pointer"
                    title="Arraste para ajustar a largura"
                  />
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      min={12}
                      max={800}
                      value={imgWidthValue || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val > 0) {
                          setImgWidthValue(val);
                          if (val >= 12) applyImageWidth(val);
                        }
                      }}
                      className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-slate-400">px</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[32, 64, 96, 140, 200].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => applyImageWidth(preset)}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                          Math.abs(imgWidthValue - preset) <= 2
                            ? 'bg-brand-600 text-white border-brand-500'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {preset}px
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={resetImageToOriginal}
                    className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 text-[10px] text-slate-300"
                    title="Restaurar tamanho original"
                  >
                    Original
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveSelectedImage}
                    className="p-1 rounded text-rose-400 hover:bg-rose-500/15"
                    title="Remover imagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImg(null);
                      setImgOverlayRect(null);
                    }}
                    className="ml-auto p-1 text-slate-400 hover:text-white"
                    title="Fechar controles da imagem"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Link Inline Popover */}
              {isLinkPopoverOpen && (
                <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    placeholder="Texto do link"
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500 w-36"
                  />
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://exemplo.com"
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500 flex-1 min-w-[160px]"
                  />
                  <button
                    type="button"
                    onClick={handleInsertLink}
                    className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] font-medium flex items-center space-x-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Inserir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLinkPopoverOpen(false)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

                  {/* Bottom Formatting Toolbar */}
              <div
                onMouseDown={(e) => {
                  const tag = (e.target as HTMLElement)?.tagName;
                  if (tag !== 'SELECT' && tag !== 'OPTION' && tag !== 'INPUT') {
                    e.preventDefault();
                  }
                  saveEditorSelection();
                }}
                className="px-2.5 py-1.5 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center gap-1 text-[11px] text-slate-300"
              >
                <select
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    execCommand('fontName', e.target.value);
                  }}
                  title="Fonte"
                  className="bg-transparent hover:bg-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 focus:outline-none cursor-pointer"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f} className="bg-slate-900 text-slate-200">
                      {f}
                    </option>
                  ))}
                </select>

                <select
                  value={fontSize}
                  onChange={(e) => {
                    setFontSize(e.target.value);
                    const found = FONT_SIZES.find((s) => s.label === e.target.value);
                    if (found) execCommand('fontSize', found.cmdValue);
                  }}
                  title="Tamanho da fonte"
                  className="bg-transparent hover:bg-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 focus:outline-none cursor-pointer"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s.label} value={s.label} className="bg-slate-900 text-slate-200">
                      {s.label}
                    </option>
                  ))}
                </select>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() => execCommand('formatBlock', 'H1')}
                  title="Título 1"
                  className="px-1.5 py-1 rounded hover:bg-slate-800 font-semibold"
                >
                  H<sub>1</sub>
                </button>
                <button
                  type="button"
                  onClick={() => execCommand('formatBlock', 'H2')}
                  title="Título 2"
                  className="px-1.5 py-1 rounded hover:bg-slate-800 font-semibold"
                >
                  H<sub>2</sub>
                </button>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() => execCommand('bold')}
                  title="Negrito"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => execCommand('italic')}
                  title="Itálico"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => execCommand('underline')}
                  title="Sublinhado"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <label
                  title="Cor do texto"
                  className="relative p-1 rounded hover:bg-slate-800 cursor-pointer flex items-center"
                >
                  <span className="font-bold text-xs leading-none" style={{ borderBottom: `2px solid ${textColor}` }}>
                    A
                  </span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => {
                      setTextColor(e.target.value);
                      execCommand('foreColor', e.target.value);
                    }}
                    className="sr-only"
                  />
                </label>

                <label
                  title="Cor de destaque"
                  className="relative p-1 rounded hover:bg-slate-800 cursor-pointer flex items-center"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-slate-600 inline-block"
                    style={{ backgroundColor: highlightColor }}
                  />
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => {
                      setHighlightColor(e.target.value);
                      execCommand('hiliteColor', e.target.value);
                    }}
                    className="sr-only"
                  />
                </label>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() => execCommand('insertUnorderedList')}
                  title="Lista com marcadores"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => execCommand('insertOrderedList')}
                  title="Lista numerada"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() => execCommand('removeFormat')}
                  title="Limpar formatação"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <RemoveFormatting className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isHtmlMode) {
                      lastLoadedSignatureIdRef.current = null;
                    }
                    setIsHtmlMode((prev) => !prev);
                  }}
                  title={isHtmlMode ? 'Voltar ao editor visual' : 'Editar código HTML'}
                  className={`p-1 rounded transition-colors ${
                    isHtmlMode ? 'bg-brand-500/20 text-brand-400' : 'hover:bg-slate-800'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  title="Inserir imagem / logotipo"
                  className="p-1 rounded hover:bg-slate-800"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleInsertImageFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setIsLinkPopoverOpen((prev) => !prev)}
                  title="Inserir link"
                  className={`p-1 rounded transition-colors ${
                    isLinkPopoverOpen ? 'bg-brand-500/20 text-brand-400' : 'hover:bg-slate-800'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={attachVCard}
                onChange={(e) => onToggleAttachVCard(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
              />
              <span>Anexar meu vCard às mensagens enviadas</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
