// Original deterministic instrumental score. No samples, external service or API key.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url), rate = 32000, bpm = 136, beat = 60 / bpm;
const bars = 32, duration = bars * 4 * beat, length = Math.ceil(duration * rate);
const left = new Float32Array(length), right = new Float32Array(length);
let seed = 20261016;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function instrument(at, seconds, kind, midi = 40, volume = 0.1, pan = 0) {
  const start = Math.floor(at * rate), count = Math.min(Math.ceil(seconds * rate), length - start), f = frequency(midi);
  let filtered = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate, release = Math.min(1, (count - i) / (rate * 0.035));
    let sample = 0, envelope = Math.min(1, t / 0.005) * release;
    if (kind === 'kick') {
      sample = Math.sin(2 * Math.PI * (42 * t + 5 * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 12) + noise() * Math.exp(-t * 100) * 0.18;
    } else if (kind === 'snare') {
      sample = (noise() * 0.85 + Math.sin(2 * Math.PI * 180 * t) * 0.3) * Math.exp(-t * 17);
    } else if (kind === 'cymbal') {
      const n = noise(); filtered += (n - filtered) * 0.12;
      sample = (n - filtered) * Math.exp(-t * (seconds > 0.5 ? 3 : 48));
    } else if (kind === 'taiko') {
      sample = (Math.sin(2 * Math.PI * (65 * t + 1.4 * (1 - Math.exp(-t * 20)))) + noise() * Math.exp(-t * 25) * 0.4) * Math.exp(-t * 6);
    } else if (kind === 'guitar') {
      const tone = Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.5 * t) +
        0.35 * Math.sin(2 * Math.PI * f * 2 * t) + 0.2 * Math.sin(2 * Math.PI * f * 3 * t);
      sample = Math.tanh(tone * 3.5) * Math.exp(-t * 8) * (0.65 + 0.35 * Math.exp(-t * 45));
    } else if (kind === 'bass') {
      sample = (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t)) * Math.exp(-t * 4);
    } else if (kind === 'brass') {
      sample = (Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 2 * t) +
        0.22 * Math.sin(2 * Math.PI * f * 3 * t)) * Math.min(1, t / 0.045) * Math.exp(-t * 1.4);
    } else {
      sample = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.003 * t)) * 0.5;
      envelope *= Math.min(1, t / 0.22);
    }
    sample *= envelope * volume;
    left[start + i] += sample * (1 - pan * 0.5);
    right[start + i] += sample * (1 + pan * 0.5);
  }
}
const progression = [40, 40, 43, 38, 40, 45, 43, 38];
const riff = [0, 0, 12, 0, 7, 0, 3, 5];
const motif = [12, 12, 15, 14, 12, 7, 10, 12];
for (let bar = 0; bar < bars; bar++) {
  const rootNote = progression[bar % 8], breakdown = bar >= 16 && bar < 20;
  const at = bar * 4 * beat;
  for (const n of [0, 7, 12]) instrument(at, 4 * beat, 'pad', rootNote + n + 12, 0.018, n === 7 ? 0.5 : -0.5);
  if (bar % 8 === 0) instrument(at, 1.5, 'cymbal', 40, 0.16, 0.4);
  for (let b = 0; b < 4; b++) {
    const t = at + b * beat;
    instrument(t, beat * 0.9, 'bass', rootNote - 12, 0.19);
    if (!breakdown || b % 2 === 0) instrument(t, 0.5, 'kick', 40, 0.3);
    if (b === 1 || b === 3) instrument(t, 0.3, 'snare', 40, 0.18, -0.08);
    if (b === 0 || b === 2) instrument(t, 0.65, 'taiko', 40, 0.13, -0.3);
    if (bar % 4 === 3) instrument(t + beat * 0.75, 0.4, 'kick', 40, 0.22);
    for (let s = 0; s < (breakdown ? 1 : 2); s++) {
      instrument(t + s * beat / 2, 0.09, 'cymbal', 40, 0.07, 0.3);
      const note = rootNote + riff[(b * 2 + s + (bar % 4 === 3 ? 2 : 0)) % riff.length];
      instrument(t + s * beat / 2, beat * 0.43, 'guitar', note, 0.16, -0.75);
      instrument(t + s * beat / 2 + 0.009, beat * 0.43, 'guitar', note + 0.04, 0.15, 0.75);
    }
    if (bar >= 8 && !breakdown && b % 2 === 0)
      instrument(t, beat * 1.7, 'brass', 40 + motif[(bar * 2 + b / 2) % motif.length], 0.075, 0.15);
    if (bar % 8 === 7 && b >= 2)
      for (let s = 0; s < 4; s++) instrument(t + s * beat / 4, 0.25, 'snare', 40, 0.1 + s * 0.02, (s % 2 - 0.5) * 0.6);
  }
}
// Short stereo reflections and soft limiting give the dense arrangement headroom.
const delay = Math.floor(beat * 0.75 * rate);
let peak = 0;
for (let i = length - 1; i >= 0; i--) {
  if (i >= delay) { left[i] += right[i - delay] * 0.11; right[i] += left[i - delay] * 0.11; }
  left[i] = Math.tanh(left[i] * 1.1); right[i] = Math.tanh(right[i] * 1.1);
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const pcm = Buffer.alloc(length * 4 + 44);
pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++) {
  const fade = Math.min(1, i / (rate * 0.012), (length - 1 - i) / (rate * 0.04));
  pcm.writeInt16LE(Math.round(left[i] * fade / peak * 29000), 44 + i * 4);
  pcm.writeInt16LE(Math.round(right[i] * fade / peak * 29000), 46 + i * 4);
}
await mkdir(new URL('public/audio/music/', root), { recursive: true });
await writeFile(new URL('public/audio/music/steel-tempest.wav', root), pcm);
const path = new URL('src/config/audio-assets.json', root);
const assets = JSON.parse(await readFile(path, 'utf8'));
assets.music = Object.fromEntries(['menu', 'usa', 'china', 'gla'].map(scene => [scene, 'audio/music/steel-tempest.wav']));
await writeFile(path, JSON.stringify(assets, null, 2) + '\n');
console.log(`Steel Tempest: ${duration.toFixed(1)}s, ${bpm} BPM, original local synthesis, stereo PCM WAV`);
