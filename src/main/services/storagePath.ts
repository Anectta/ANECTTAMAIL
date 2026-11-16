import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const CONFIG_FILENAME = 'storage-config.json';

export function getDefaultUserDataDir(): string {
  return app.getPath('userData');
}

export function getStorageConfigPath(): string {
  return path.join(getDefaultUserDataDir(), CONFIG_FILENAME);
}

/**
 * Retorna a pasta configurada para armazenamento de dados (banco de mensagens,
 * anexos e modelos). Aceita pastas locais, unidades mapeadas ou caminhos de rede UNC.
 * Mantém settings.json e storage-config.json no perfil padrão do usuário.
 */
export function getDataStorageDir(): string {
  try {
    const cfgPath = getStorageConfigPath();
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const customDir = typeof parsed?.dataDir === 'string' ? parsed.dataDir.trim() : '';
      if (customDir) {
        return customDir;
      }
    }
  } catch {
    // fallback para pasta padrão
  }
  return getDefaultUserDataDir();
}
