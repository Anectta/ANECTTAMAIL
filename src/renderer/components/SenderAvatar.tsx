import React from 'react';

interface SenderAvatarProps {
  avatar?: string;
  name: string;
  email?: string;
  size?: number; // tamanho em px (padrão 36)
  className?: string;
}

export const SenderAvatar: React.FC<SenderAvatarProps> = ({
  avatar,
  name,
  email,
  size = 36,
  className = '',
}) => {
  const getInitials = (str: string): string => {
    if (!str) return 'AN';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const shouldBlockExternal = (() => {
    if (!avatar || !/^https?:\/\//i.test(avatar)) return false;
    try {
      return localStorage.getItem('anectta_download_external_avatars') === 'false';
    } catch {
      return false;
    }
  })();

  const effectiveAvatar = shouldBlockExternal ? undefined : avatar;

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center rounded-xl select-none transition-all ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      title={email ? `${name} (${email})` : name}
    >
      {effectiveAvatar ? (
        <div className="w-full h-full rounded-xl overflow-hidden border border-slate-700/80 shadow-md">
          <img
            src={effectiveAvatar}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div
          className="w-full h-full rounded-xl flex items-center justify-center font-bold text-xs tracking-wider border border-brand-500/30 text-white shadow-sm"
          style={{
            background: 'var(--accent-gradient, linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%))',
          }}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
};
