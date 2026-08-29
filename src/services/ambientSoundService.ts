import { AmbientSoundType } from "../types/timer";

class AmbientSoundService {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private currentType: AmbientSoundType = "none";
  private volume: number = 0.5;

  private getContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentType(): AmbientSoundType {
    return this.currentType;
  }

  public play(type: AmbientSoundType): void {
    this.stop();
    if (type === "none") {
      this.currentType = "none";
      return;
    }

    try {
      const ctx = this.getContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume, ctx.currentTime);
      gain.connect(ctx.destination);
      this.gainNode = gain;

      if (type === "white") {
        this.currentSource = this.createWhiteNoiseNode(ctx, gain);
      } else if (type === "rain") {
        this.currentSource = this.createRainNoiseNode(ctx, gain);
      } else if (type === "brown") {
        this.currentSource = this.createBrownNoiseNode(ctx, gain);
      }

      this.currentType = type;
    } catch (e) {
      console.warn("Ambient sound playback error:", e);
    }
  }

  public stop(): void {
    if (this.currentSource) {
      try {
        (this.currentSource as any).stop?.();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    this.currentType = "none";
  }

  // 백색소음 노드 생성
  private createWhiteNoiseNode(ctx: AudioContext, destination: AudioNode): AudioNode {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // 약간의 고음 깎기 (귀 피로 방지)
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3500;

    noise.connect(filter);
    filter.connect(destination);
    noise.start();
    return noise;
  }

  // 빗소리 노드 생성 (핑크 노이즈 + 로우패스 + 잔잔한 앰비언스)
  private createRainNoiseNode(ctx: AudioContext, destination: AudioNode): AudioNode {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.6;

    noise.connect(filter);
    filter.connect(destination);
    noise.start();
    return noise;
  }

  // 브라운 노이즈 노드 생성 (깊고 묵직한 저음 집중 사운드)
  private createBrownNoiseNode(ctx: AudioContext, destination: AudioNode): AudioNode {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 0.7; // gain
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;

    noise.connect(filter);
    filter.connect(destination);
    noise.start();
    return noise;
  }

  // 세션 완료 알림음 (미니멀 차임벨)
  public playChime(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // 1음 (587Hz - D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      // 2음 (880Hz - A5) 약간 뒤에 재생
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.2);
      gain2.gain.setValueAtTime(0.35, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 1.8);
    } catch (e) {
      console.warn("Chime sound playback error:", e);
    }
  }
}

export const ambientSound = new AmbientSoundService();
