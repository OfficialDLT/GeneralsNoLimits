import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
let local = '';
try { local = await readFile(new URL('.env', root), 'utf8'); } catch {}
const key = local.match(/^ELEVENLABS_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim() || process.env.ELEVENLABS_API_KEY;
if (!key) throw Error('Missing ELEVENLABS_API_KEY');
const manifestPath = new URL('public/audio/elevenlabs-manifest.json', root);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assetsPath = new URL('src/config/audio-assets.json', root);
const assets = JSON.parse(await readFile(assetsPath, 'utf8'));
const jobs = {
  takeoff: 'A realistic military jet accelerating down a runway and taking off, turbine whine rising into a powerful afterburner roar, distant outdoor airfield perspective. No speech or music.',
  landing: 'A realistic military jet landing on a runway, approaching turbine roar, brief tire chirp at touchdown, air brakes and engine winding down. No speech or music.',
};
await mkdir(new URL('public/audio/effects/', root), { recursive: true });
for (const [name, text] of Object.entries(jobs)) {
  const path = `audio/effects/${name}.mp3`;
  const body = { text, duration_seconds: 5, model_id: 'eleven_text_to_sound_v2', prompt_influence: 0.6 };
  const signature = JSON.stringify({ endpoint: 'sound-generation', body });
  if (manifest[path]?.signature !== signature) {
    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(`ElevenLabs ${response.status}: ${JSON.stringify((await response.json()).detail)}; no automatic retry`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < 1000) throw Error('Empty audio generation');
    const target = new URL(`public/${path}`, root);
    await writeFile(new URL(`public/${path}.part`, root), data);
    await rename(new URL(`public/${path}.part`, root), target);
    manifest[path] = { provider: 'ElevenLabs', signature, bytes: data.length };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  assets.effects[name] = path;
  console.log(`Ready: ${path}`);
}
await writeFile(assetsPath, JSON.stringify(assets, null, 2) + '\n');
