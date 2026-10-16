# Asset production

Original generated artwork in `public/art/` replaces the vector portrait fallbacks and adds battlefield terrain, weathered model surfaces, transparent pine foliage and a menu illustration. Images were produced with the built-in imagegen tool. No original game files were sampled.

Prompt set: quasi-realistic early-2000s military RTS atmosphere; a dusty tank on a desert airfield at sunset with empty dark space for menu text; seamless top-down compacted desert soil and gravel; neutral grey worn painted steel for tintable triplanar model materials; a helmeted desert infantry portrait; a sand-colored tank portrait; one complete realistic pine tree with olive needles on a transparent background. No text, logos, insignia or watermarks. The terrain and steel prompts request uniform diffuse lighting and tileable edges.

The mesh catalog remains procedural. Shared model materials now project the generated weathering texture along three axes, keeping merged geometry and bounded draw calls. Terrain uses a repeated color and bump texture with the existing fog-of-war shader. Infantry and tank command cards use generated class portraits; other classes retain their individual 3D previews.

## ElevenLabs audio

Copy `.env.example` to `.env` and configure `ELEVENLABS_API_KEY`. The file is ignored by Git. The key needs Voices read access, Text to Speech, Sound Effects and Music generation. Account/User read access is unnecessary.

Run `npm run assets:audio` with Node 24. On Windows networks using the system certificate store, use `node --use-system-ca scripts/generate-elevenlabs.mjs`.

This is a paid generation operation: 162 unit lines, six announcer lines, six effects and optionally four 60-second instrumental tracks. Voices are selected from the account's actual voice list. The script uses multilingual v2 speech, sound effects v2 and music v2. Scripts and prompts are recorded in `scripts/generate-elevenlabs.mjs`; per-file generation parameters and byte counts are saved in `public/audio/elevenlabs-manifest.json`.

The delivered version retains the four original synthesized music tracks by explicit user choice: ElevenLabs rejected Music API access because the account is on a free plan. All 174 speech/effect files were generated successfully. Use `npm run assets:audio -- --keep-music` to resume without attempting Music API generation.

Completed matching generations are skipped on resume. Errors stop generation without automatic paid retries. Effects and announcer routing are enabled only after their complete asset sets exist. The existing synthetic production script is legacy and must not be run over the ElevenLabs assets.

Audio is packaged for offline playback; no API key or ElevenLabs calls are included in the browser game. Combat effects have per-effect rate limits and a 12-source limit; engine audio is mixed quietly. Existing voice/music controls and voice-driven music ducking remain available.

## Validation

`npm test`, `npm run build` and `npm run test:browser` exercise simulation/catalog integrity, production bundling and actual browser gameplay. The browser test also fails on shader/console errors and missing art/audio responses, and saves menu/game screenshots in this directory.

The terrain/airport update passed all 35 unit/simulation/catalog tests, the production build, the full browser gameplay/audio/airport test and the Go launcher tests. The Windows executable was rebuilt with the updated assets and gameplay, and its SHA-256 is recorded in `releases/SHA256SUMS.txt`. The browser test captures the airport and town in `docs/airport-update.png` and `docs/highland-town.png`.
