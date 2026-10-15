import { factions, units } from "../config/index.js";
import profiles from "../config/voice-profiles.json" with { type: "json" };
import assets from '../config/audio-assets.json' with { type: 'json' };
const base = import.meta.env.BASE_URL;
export class Audio {
  constructor() {
    this.volume = 0.4;
    this.musicVolume = 0.42;
    this.enabled = true;
    this.voiceEnabled = true;
    this.musicEnabled = true;
    this.lastVoice = -10000;
    this.combatUntil = 0;
    this.scene = "menu";
    this.buffers = new Map();
    this.voiceToken = 0;
    this.lastKey = "";
    this.playingVoice = null;
    this.unlocked = false;
    this.music = new window.Audio();
    this.music.loop = true;
    this.music.preload = "none";
  }
  unlock() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.connect(this.master);
      this.musicSource = this.context.createMediaElementSource(this.music);
      this.musicSource.connect(this.musicGain);
    }
    this.unlocked = true;
    this.context.resume();
    this.syncMix();
    this.playMusic();
    this.onStateChange?.();
  }
  syncMix() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const master = this.enabled ? this.volume : 0,
      music = this.musicVolume * (this.playingVoice ? 0.25 : 1);
    if (this.lastMaster !== master) {
      this.lastMaster = master;
      this.master.gain.setTargetAtTime(master, now, 0.06);
    }
    if (this.lastMusic !== music) {
      this.lastMusic = music;
      this.musicGain.gain.setTargetAtTime(music, now, 0.15);
    }
  }
  setScene(scene) {
    if (this.scene === scene && this.music.src) return;
    this.scene = scene;
    const track = scene === "menu" ? "iron-horizon" : `${scene}-command`;
    this.music.src = `${base}audio/music/${track}.mp3`;
    this.music.load();
    this.playMusic();
  }
  playMusic() {
    if (this.unlocked && this.enabled && this.musicEnabled) {
      if (!this.music.src) this.setScene(this.scene);
      else if (this.music.paused) this.music.play().catch(() => {});
    } else this.music.pause();
  }
  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    this.playMusic();
    this.onStateChange?.();
  }
  tone(freq = 200, duration = 0.1, kind = "sine", gain = 0.1) {
    if (!this.context || !this.enabled) return;
    const o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = kind;
    o.frequency.setValueAtTime(freq, this.context.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.5),
      this.context.currentTime + duration,
    );
    g.gain.setValueAtTime(gain, this.context.currentTime);
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + duration,
    );
    o.connect(g);
    g.connect(this.master);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start();
    o.stop(this.context.currentTime + duration);
  }
  async effect(name, volume = 0.3) {
    const path = assets.effects[name];
    if (!path || !this.context || !this.enabled) return;
    this.effectTimes ??= new Map();
    this.activeEffects ??= 0;
    const now = performance.now();
    if (now - (this.effectTimes.get(name) ?? -10000) < 130 || this.activeEffects >= 12) return;
    this.effectTimes.set(name, now);
    this.activeEffects++;
    try {
      const key = `effect:${name}`;
      if (!this.buffers.has(key)) this.buffers.set(key, fetch(`${base}${path}`)
        .then(r => { if (!r.ok) throw Error('Effect unavailable'); return r.arrayBuffer(); })
        .then(b => this.context.decodeAudioData(b)));
      const buffer = await this.buffers.get(key);
      if (!this.enabled) { this.activeEffects--; return; }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain); gain.connect(this.master);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.activeEffects--; };
      source.start();
    } catch { this.buffers.delete(`effect:${name}`); this.activeEffects--; }
  }
  say(text, faction = "usa", type) {
    if (
      !this.enabled ||
      !this.voiceEnabled ||
      !window.speechSynthesis ||
      performance.now() - this.lastVoice < 1800
    )
      return;
    this.lastVoice = performance.now();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.volume = this.volume;
    const profile = profiles[type];
    u.rate = profile?.tempo || 1;
    u.pitch = profile?.pitch || (faction === "china" ? 0.8 : 1);
    speechSynthesis.speak(u);
  }
  async voice(action, faction, type) {
    if (!this.enabled || !this.voiceEnabled) return;
    const profile = type === 'announcer' && assets.announcements[action]
      ? { lines: { [action]: action.replaceAll('_', ' ') } }
      : profiles[type];
    if (!profile || !this.context) {
      this.say(
        units[type]?.voice?.[action] ||
          factions[faction].voice[action] ||
          action,
        faction,
        type,
      );
      return;
    }
    const key = `${type}-${action}`,
      now = performance.now();
    if (this.lastKey === key && now - this.lastVoice < 700) return;
    this.lastKey = key;
    this.lastVoice = now;
    const token = ++this.voiceToken;
    try {
      let promise = this.buffers.get(key);
      if (!promise) {
        const path = type === 'announcer' ? assets.announcements[action] : `${profile.assetBase}-${action}.mp3`;
        promise = fetch(`${base}${path}`)
          .then((r) => {
            if (!r.ok) throw Error("Voice unavailable");
            return r.arrayBuffer();
          })
          .then((bytes) => this.context.decodeAudioData(bytes));
        this.buffers.set(key, promise);
        if (this.buffers.size > 96)
          this.buffers.delete(this.buffers.keys().next().value);
      }
      const buffer = await promise;
      if (token !== this.voiceToken || !this.voiceEnabled || !this.enabled) return;
      this.playingVoice?.stop();
      speechSynthesis?.cancel();
      const source = this.context.createBufferSource(),
        gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.85;
      source.connect(gain);
      gain.connect(this.master);
      this.playingVoice = source;
      this.syncMix();
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this.playingVoice === source) {
          this.playingVoice = null;
          this.syncMix();
        }
      };
      source.start();
    } catch {
      this.buffers.delete(key);
      this.lastVoice = -10000;
      this.say(
        profile.lines[action] || units[type].voice[action],
        faction,
        type,
      );
    }
  }
  event(e, faction, type) {
    const eva = {
      building_complete: "Building complete",
      low_power: "Low power",
      destroyed: "Unit lost",
      under_attack: "Our base is under attack",
      super_detected: "Superweapon detected",
      promotion: "You have been promoted",
    };
    if (e.type === "unit_complete" && e.owner === 0)
      this.voice("select", faction, type);
    else if (
      eva[e.type] &&
      (e.owner === 0 || e.type === "super_detected") &&
      !this.playingVoice
    )
      if (assets.announcements[e.type]) this.voice(e.type, faction, 'announcer');
      else this.say(eva[e.type], faction);
    if (e.type === "shot") {
      this.combatUntil = performance.now() + 5000;
      const effect = { Laser: 'laser', Missile: 'missile', Bullet: 'gunfire' }[e.damageType] || 'cannon';
      if (assets.effects[effect]) this.effect(effect);
      else this.tone(e.damageType === "Laser" ? 700 : 180, 0.06, "sawtooth", 0.06);
    }
    if (["impact", "destroyed", "superweapon"].includes(e.type)) {
      if (assets.effects.explosion) this.effect('explosion', e.radius > 30 ? 0.65 : 0.35);
      else this.tone(70, e.radius > 30 ? 0.5 : 0.18, "triangle", 0.18);
    }
  }
  update(scene, moving) {
    this.setScene(scene);
    this.syncMix();
    this.playMusic();
    if (this.music)
      this.music.playbackRate =
        performance.now() < this.combatUntil ? 1.035 : 1;
    if (moving && this.context && performance.now() > (this.nextEngine || 0)) {
      this.nextEngine = performance.now() + 900;
      if (assets.effects.engine) { this.nextEngine = performance.now() + 2900; this.effect('engine', 0.07); }
      else this.tone(45, 0.3, "triangle", 0.015);
    }
  }
}
