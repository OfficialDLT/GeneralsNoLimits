import { factions, units } from "../config/index.js";
export class Audio {
  constructor() {
    this.volume = 0.35;
    this.enabled = true;
    this.lastVoice = -10;
    this.combatUntil = 0;
    this.note = 0;
    this.nextMusic = 0;
  }
  unlock() {
    if (!this.context)
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.context.resume();
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
    g.gain.setValueAtTime(gain * this.volume, this.context.currentTime);
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + duration,
    );
    o.connect(g);
    g.connect(this.context.destination);
    o.start();
    o.stop(this.context.currentTime + duration);
  }
  say(text, faction = "usa") {
    if (
      !this.enabled ||
      !window.speechSynthesis ||
      performance.now() - this.lastVoice < 1800
    )
      return;
    this.lastVoice = performance.now();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.volume = this.volume;
    u.rate = faction === "gla" ? 0.9 : faction === "china" ? 0.85 : 1;
    u.pitch = faction === "china" ? 0.8 : faction === "gla" ? 0.95 : 1.05;
    speechSynthesis.speak(u);
  }
  voice(action, faction, type) {
    this.say(
      (units[type]?.voice?.[action] ? units[type].voice[action] + " " : "") +
        (factions[faction].voice[action] || action),
      faction,
    );
  }
  event(e, faction) {
    const eva = {
      building_complete: "Building complete",
      low_power: "Low power",
      destroyed: "Unit lost",
      under_attack: "Our base is under attack",
      super_detected: "Superweapon detected",
      promotion: "You have been promoted",
      unit_complete: "Unit ready",
    };
    if (eva[e.type] && (e.owner === 0 || e.type === "super_detected"))
      this.say(eva[e.type], faction);
    if (e.type === "shot") {
      this.combatUntil = performance.now() + 5000;
      this.tone(e.damageType === "Laser" ? 700 : 180, 0.06, "sawtooth", 0.06);
    }
    if (["impact", "destroyed", "superweapon"].includes(e.type))
      this.tone(70, e.radius > 30 ? 0.5 : 0.18, "triangle", 0.18);
  }
  update(faction, moving) {
    const now = performance.now();
    if (now > this.nextMusic) {
      this.nextMusic = now + (now < this.combatUntil ? 650 : 1500);
      const scale = factions[faction].music;
      this.tone(scale[this.note++ % scale.length], 0.5, "sine", 0.04);
      if (moving) this.tone(45, 0.25, "triangle", 0.025);
    }
  }
}
