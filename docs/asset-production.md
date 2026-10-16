# Asset production

Original generated artwork in `public/art/` replaces the vector portrait fallbacks and adds battlefield terrain, weathered model surfaces, transparent pine foliage and a menu illustration. Images were produced with the built-in imagegen tool. No original game files were sampled.

Prompt set: quasi-realistic early-2000s military RTS atmosphere; a dusty tank on a desert airfield at sunset with empty dark space for menu text; seamless top-down compacted desert soil and gravel; neutral grey worn painted steel for tintable triplanar model materials; a helmeted desert infantry portrait; a sand-colored tank portrait; one complete realistic pine tree with olive needles on a transparent background. No text, logos, insignia or watermarks. The terrain and steel prompts request uniform diffuse lighting and tileable edges.

The mesh catalog remains procedural. Shared model materials now project the generated weathering texture along three axes, keeping merged geometry and bounded draw calls. Terrain uses a repeated color and bump texture with the existing fog-of-war shader. Infantry and tank command cards use generated class portraits; other classes retain their individual 3D previews.

## ElevenLabs audio

Copy `.env.example` to `.env` and configure `ELEVENLABS_API_KEY`. The file is ignored by Git. The key needs Voices read access, Text to Speech, Sound Effects and Music generation. Account/User read access is unnecessary.

Run `npm run assets:audio` with Node 24. On Windows networks using the system certificate store, use `node --use-system-ca scripts/generate-elevenlabs.mjs`.

This is a paid generation operation: 162 unit lines, six announcer lines, six effects and optionally four 60-second instrumental tracks. Voices are selected from the account's actual voice list. The script uses multilingual v2 speech, sound effects v2 and music v2. Scripts and prompts are recorded in `scripts/generate-elevenlabs.mjs`; per-file generation parameters and byte counts are saved in `public/audio/elevenlabs-manifest.json`.

The delivered version uses **Steel Tempest**, an original 56.5-second, 136 BPM instrumental score synthesized locally by `scripts/generate-war-score.mjs`, as explicitly requested when ElevenLabs Music was unavailable. The arrangement includes double-tracked distorted riffs, bass, marching snare, heavy kick, taiko, cymbals and brass. No recordings or samples were used. Run `npm run assets:score` to reproduce the stereo PCM WAV. The four older tracks remain as fallbacks.

All 176 ElevenLabs speech/effect files are packaged, including the new takeoff and landing effects. Their exact prompts are in `scripts/generate-flight-audio.mjs` and the generation manifest. `npm run assets:audio -- --keep-music` preserves the locally synthesized score and additional flight effects.

Completed matching generations are skipped on resume. Errors stop generation without automatic paid retries. Effects and announcer routing are enabled only after their complete asset sets exist. The existing synthetic production script is legacy and must not be run over the ElevenLabs assets.

Audio is packaged for offline playback; no API key or ElevenLabs calls are included in the browser game. Combat effects have per-effect rate limits and a 12-source limit; engine audio is mixed quietly. Existing voice/music controls and voice-driven music ducking remain available.

## Validation

`npm test`, `npm run build` and `npm run test:browser` exercise simulation/catalog integrity, production bundling and actual browser gameplay. The browser test also fails on shader/console errors and missing art/audio responses, and saves menu/game screenshots in this directory.

The update has 38 unit/simulation/catalog tests, including model uniqueness, formation destinations, remembered building state, saved aircraft guard orbits and the full four-shot sortie cycle. Browser tests exercise actual Shift-number shortcuts, formation buttons, distinct portraits, bridge fog shaders, all 176 generated audio files and the local score. `PRESENTATION_ONLY=1` runs only the focused new presentation/controls checks. The Windows executable embeds the current build; its SHA-256 is recorded in `releases/SHA256SUMS.txt`.
