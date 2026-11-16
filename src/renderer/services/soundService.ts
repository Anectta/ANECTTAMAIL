/**
 * SoundService - Sistema de Áudio Nativo via Web Audio API para o Anectta MAIL
 * Gera efeitos sonoros sintetizados em tempo real, sem dependência de arquivos externos.
 * Cada tema/skin possui frequências, timbres e envelopes harmônicos exclusivos.
 */

export type SoundEffect = 'click' | 'send' | 'receive' | 'notify' | 'pop' | 'error';
export type SoundTheme = 'executive' | 'cyberpunk' | 'nordic' | 'light' | 'vintage';
export type NotificationPreset = 'theme' | 'chirp' | 'chime' | 'pulse' | 'bell' | 'none';

class SoundService {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.35; // 0.0 a 1.0
  private currentTheme: SoundTheme = 'executive';
  private notificationPreset: NotificationPreset = 'theme';

  constructor() {
    try {
      const savedMute = localStorage.getItem('anectta_sound_enabled');
      if (savedMute !== null) {
        this.soundEnabled = savedMute === 'true';
      }
      const savedVolume = localStorage.getItem('anectta_sound_volume');
      if (savedVolume !== null) {
        this.volume = parseFloat(savedVolume);
      }
    } catch {
      // Ignora erro em ambientes restritos
    }
  }

  private initContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setTheme(theme: SoundTheme): void {
    this.currentTheme = theme;
  }

  public setNotificationPreset(preset: NotificationPreset): void {
    this.notificationPreset = preset;
  }

  public playNotificationPreset(preset?: NotificationPreset): void {
    const active = preset ?? this.notificationPreset;
    if (active === 'none') return;
    if (active === 'theme') {
      this.play('notify');
      return;
    }
    if (!this.soundEnabled && !preset) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume, now);
      masterGain.connect(ctx.destination);

      if (active === 'chirp') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.09);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.16);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (active === 'chime') {
        [659.25, 880, 1174.66].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.07;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.34);
        });
      } else if (active === 'pulse') {
        [520, 780].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.09;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.12);
        });
      } else if (active === 'bell') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.48);
      }
    } catch {
      // ignore audio errors
    }
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem('anectta_sound_enabled', String(enabled));
    } catch {}
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('anectta_sound_volume', String(this.volume));
    } catch {}
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Toca som nativo do sistema operacional através do contextBridge
   */
  public async playNative(type?: 'beep' | 'notification' | 'alert'): Promise<void> {
    if (!this.soundEnabled) return;
    try {
      if (window.electronAPI?.playNativeSound) {
        await window.electronAPI.playNativeSound(type);
      }
    } catch (err) {
      console.warn('[SoundService] Falha ao acionar som nativo do sistema:', err);
    }
  }

  public play(effect: SoundEffect): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(this.volume, now);
      master.connect(ctx.destination);

      switch (effect) {
        case 'click':
          this.playClick(ctx, master, now);
          break;
        case 'send':
          this.playSend(ctx, master, now);
          break;
        case 'receive':
          this.playReceive(ctx, master, now);
          break;
        case 'notify':
          this.playNotify(ctx, master, now);
          break;
        case 'pop':
          this.playPop(ctx, master, now);
          break;
        case 'error':
          this.playError(ctx, master, now);
          break;
      }
    } catch (err) {
      console.warn('[SoundService] Falha ao tocar som:', err);
    }
  }

  // Clique de interface adaptado ao tema
  private playClick(ctx: AudioContext, dest: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (this.currentTheme === 'cyberpunk') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (this.currentTheme === 'vintage') {
      // Clique de máquina de escrever
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.065);
    } else {
      // Padrão executivo / polar / nordic: clique magnético sutil
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.035);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  }

  // Envio de e-mail (glide ascendente / whoosh suave)
  private playSend(ctx: AudioContext, dest: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (this.currentTheme === 'cyberpunk') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.22);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    } else if (this.currentTheme === 'vintage') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    } else {
      // Executive / Nordic: arpeggio ascendente límpido
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18); // C6
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    }

    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  // Recebimento de e-mail (harmonia de dois acordes)
  private playReceive(ctx: AudioContext, dest: GainNode, now: number): void {
    const notes = this.currentTheme === 'cyberpunk'
      ? [587.33, 880, 1174.66] // D5, A5, D6 sci-fi
      : this.currentTheme === 'vintage'
      ? [392.00, 523.25] // G4, C5 caloroso
      : this.currentTheme === 'nordic'
      ? [659.25, 987.77] // E5, B5 cristalino
      : [523.25, 659.25, 783.99]; // C5, E5, G5 tríade executiva perfeita

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.07;
      const duration = 0.35;

      osc.type = this.currentTheme === 'cyberpunk' ? 'square' : 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      const peakGain = this.currentTheme === 'cyberpunk' ? 0.09 : 0.16;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    });
  }

  // Notificação flutuante Notifier
  private playNotify(ctx: AudioContext, dest: GainNode, now: number): void {
    // Acorde duplo de alta ressonância
    [659.25, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + 0.42);
    });
  }

  private playPop(ctx: AudioContext, dest: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  private playError(ctx: AudioContext, dest: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(180, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

export const soundService = new SoundService();
