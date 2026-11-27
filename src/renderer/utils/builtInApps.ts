import type { AppsSettings } from '@/types/settings';

/**
 * Aplicativos web prontos (abertos no módulo de apps web, em <webview> isolado e com sessão própria).
 * Os ícones são genéricos, sem usar marcas de terceiros.
 */
export interface BuiltInApp {
  id: string;
  name: string;
  url: string;
  description: string;
  /** Chave da opção em Configurações → Aplicativos. */
  settingKey: 'enableDropboxApp' | 'enableOneDriveApp' | 'enableGoogleDriveApp' | 'enableICloudApp';
  /** Classe de cor do ícone. */
  iconClass: string;
  /** Classes do quadrado do ícone nas Configurações. */
  tileClass: string;
}

export const DROPBOX_APP: BuiltInApp = {
  id: 'builtin-dropbox',
  name: 'Dropbox',
  url: 'https://www.dropbox.com/home',
  description: 'Seus arquivos do Dropbox dentro do app, em uma área separada e segura.',
  settingKey: 'enableDropboxApp',
  iconClass: 'text-sky-400',
  tileClass: 'bg-sky-500/15 border-sky-500/30',
};

export const ONEDRIVE_APP: BuiltInApp = {
  id: 'builtin-onedrive',
  name: 'OneDrive',
  url: 'https://onedrive.live.com/',
  description: 'Seus arquivos do OneDrive (pessoal ou da empresa) dentro do app, em uma área separada.',
  settingKey: 'enableOneDriveApp',
  iconClass: 'text-blue-400',
  tileClass: 'bg-blue-500/15 border-blue-500/30',
};

export const GOOGLE_DRIVE_APP: BuiltInApp = {
  id: 'builtin-googledrive',
  name: 'Google Drive',
  url: 'https://drive.google.com/drive/my-drive',
  description: 'Seus arquivos do Google Drive dentro do app, em uma área separada.',
  settingKey: 'enableGoogleDriveApp',
  iconClass: 'text-emerald-400',
  tileClass: 'bg-emerald-500/15 border-emerald-500/30',
};

export const ICLOUD_APP: BuiltInApp = {
  id: 'builtin-icloud',
  name: 'iCloud Drive',
  url: 'https://www.icloud.com/iclouddrive/',
  description: 'Seus arquivos do iCloud Drive dentro do app, em uma área separada.',
  settingKey: 'enableICloudApp',
  iconClass: 'text-slate-300',
  tileClass: 'bg-slate-500/15 border-slate-500/30',
};

export const BUILT_IN_APPS: BuiltInApp[] = [DROPBOX_APP, ONEDRIVE_APP, GOOGLE_DRIVE_APP, ICLOUD_APP];

export const isBuiltInAppEnabled = (apps: AppsSettings | undefined, app: BuiltInApp) => Boolean(apps?.[app.settingKey]);
