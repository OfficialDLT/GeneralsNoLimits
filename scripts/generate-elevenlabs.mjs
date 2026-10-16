// Offline asset production only: credentials never enter the Vite application.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
let local = '';
try { local = await readFile(resolve(root, '.env'), 'utf8'); } catch {}
const key = local.match(/^ELEVENLABS_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim() || process.env.ELEVENLABS_API_KEY;
if (!key) throw Error('Set ELEVENLABS_API_KEY in .env before generating audio.');
const api = async (path, body) => {
  const response = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const detail = failure.detail?.message || failure.detail?.status || failure.detail || 'Request rejected';
    throw Error(`ElevenLabs ${response.status} at ${path.split('?')[0]}: ${JSON.stringify(detail)}; generation stopped, no automatic paid retry.`);
  }
  return response;
};
// Listing voices validates credentials without requiring unrelated account-read access.
const voices = (await (await api('voices')).json()).voices;
const male = voices.filter(v => v.labels?.gender === 'male');
const female = voices.filter(v => v.labels?.gender === 'female');
if (!male.length || !female.length) throw Error('Account needs at least one male and female voice.');
const profiles = JSON.parse(await readFile(resolve(root, 'src/config/voice-profiles.json'), 'utf8'));
const manifestPath = resolve(root, 'public/audio/elevenlabs-manifest.json');
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
async function generate(path, endpoint, body) {
  // Resume completed work without charging twice. A changed prompt generates a new asset.
  const signature = JSON.stringify({ endpoint, body });
  const target = resolve(root, 'public', path);
  if (manifest[path]?.signature === signature) {
    try { if ((await readFile(target)).length > 1000) return; } catch {}
  }
  const bytes = Buffer.from(await (await api(endpoint, body)).arrayBuffer());
  if (bytes.length < 1000) throw Error(`Empty generation: ${path}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(`${target}.part`, bytes);
  await rename(`${target}.part`, target);
  manifest[path] = { provider: 'ElevenLabs', signature, bytes: bytes.length };
  await writeFile(`${manifestPath}.part`, JSON.stringify(manifest, null, 2) + '\n');
  await rename(`${manifestPath}.part`, manifestPath);
  console.log(`Generated ${path}`);
}
let index = 0;
for (const [id, profile] of Object.entries(profiles)) {
  const voice = id === 'lotus' ? female[0] : male[index++ % male.length];
  for (const [action, text] of Object.entries(profile.lines)) {
    await generate(`${profile.assetBase}-${action}.mp3`, `text-to-speech/${voice.voice_id}?output_format=mp3_44100_128`, {
      text, model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
    });
  }
  profile.voice = voice.voice_id;
  profile.provider = 'ElevenLabs';
}
await writeFile(resolve(root, 'src/config/voice-profiles.json'), JSON.stringify(profiles, null, 2) + '\n');
const effects = {
  gunfire: ['A short realistic military rifle burst outdoors, sharp dry cracks and mechanical action, no voices or music.', 1.5],
  cannon: ['One modern tank cannon firing, powerful concussive report, metallic mechanism and short outdoor echo, no music.', 2],
  missile: ['A single tactical rocket launch, ignition thump and roaring whoosh fading away, no voices or music.', 2],
  explosion: ['A realistic battlefield explosion, sharp blast, deep rumble, scattered metal debris and dirt, no voices or music.', 3],
  engine: ['Steady diesel tank engine with moving steel tracks on gravel, close mechanical detail, no voices or music.', 3],
  laser: ['A powerful directed energy weapon discharge, electrical snap and sizzling pulse, grounded military science fiction, no music.', 1],
};
for (const [name, [text, duration_seconds]] of Object.entries(effects))
  await generate(`audio/effects/${name}.mp3`, 'sound-generation', { text, duration_seconds, model_id: 'eleven_text_to_sound_v2', prompt_influence: 0.6 });
const announcements = {
  building_complete: 'Building complete', low_power: 'Low power', destroyed: 'Unit lost',
  under_attack: 'Our base is under attack', super_detected: 'Superweapon detected',
  promotion: 'You have been promoted',
};
for (const [name, text] of Object.entries(announcements))
  await generate(`audio/announcer/${name}.mp3`, `text-to-speech/${female[0].voice_id}?output_format=mp3_44100_128`, {
    text, model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.7, similarity_boost: 0.75, use_speaker_boost: true },
  });
const previousAssets = JSON.parse(await readFile(resolve(root, 'src/config/audio-assets.json'), 'utf8'));
await writeFile(resolve(root, 'src/config/audio-assets.json'), JSON.stringify({
  ...previousAssets,
  effects: { ...previousAssets.effects, ...Object.fromEntries(Object.keys(effects).map(name => [name, `audio/effects/${name}.mp3`])) },
  announcements: { ...previousAssets.announcements, ...Object.fromEntries(Object.keys(announcements).map(name => [name, `audio/announcer/${name}.mp3`])) },
}, null, 2) + '\n');
const tracks = {
  'iron-horizon': 'Cinematic military strategy briefing, restrained strings, low brass, snare drums, tense atmospheric desert warfare.',
  'usa-command': 'Modern military strategy battle score, driving rock guitar, live drums, heroic brass, confident armored advance.',
  'china-command': 'Military strategy battle score, powerful orchestral percussion, low brass, plucked Chinese strings, disciplined armored advance.',
  'gla-command': 'Desert insurgency strategy battle score, oud, hand percussion, tense strings and gritty electronic bass, urgent irregular rhythms.',
};
for (const [name, prompt] of Object.entries(process.argv.includes('--keep-music') ? {} : tracks))
  await generate(`audio/music/${name}.mp3`, 'music', { prompt: `${prompt} Original instrumental, grounded early 2000s RTS atmosphere, sustained gameplay arrangement with gentle opening and ending.`, music_length_ms: 60000, model_id: 'music_v2', force_instrumental: true });
console.log(process.argv.includes('--keep-music') ? 'All unit voices, announcer lines and effects generated; existing music retained.' : 'All unit voices, effects and four music tracks generated.');
