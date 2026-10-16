import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { units, buildings } from "../config/index.js";
import profiles from "../config/voice-profiles.json" with { type: "json" };
import { entityModel } from "./models.js";
import { existsSync, statSync } from "node:fs";
import { createHash } from 'node:crypto';
test("every catalog model has finite geometry, raycastable faces and bounded draw calls", () => {
  const fingerprints = new Map();
  for (const [type, d] of Object.entries({ ...units, ...buildings })) {
    const model = entityModel(type, d, "#63b9ff");
    const fingerprint = createHash('sha256');
    let count = 0;
    model.traverse((o) => {
      if (o.isMesh) {
        count++;
        assert.ok(o.geometry.attributes.position.count > 2, type);
        assert.ok(
          [...o.geometry.attributes.position.array].every(Number.isFinite),
          type,
        );
        assert.ok(o.geometry.attributes.normal, type);
        for (const key of ['position', 'normal', 'color']) {
          const a = o.geometry.attributes[key]?.array;
          if (a) fingerprint.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
        }
      }
    });
    const box = new THREE.Box3().setFromObject(model),
      size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0, type);
    assert.ok(Math.max(size.x, size.y, size.z) < 150, type);
    assert.ok(count <= 3, type);
    const hash = fingerprint.digest('hex');
    assert.equal(fingerprints.get(hash), undefined, `${type} shares its model/portrait with ${fingerprints.get(hash)}`);
    fingerprints.set(hash, type);
  }
});
test("all unit types have distinct voiced profiles and three packaged radio lines", () => {
  const identities = new Set();
  for (const id of Object.keys(units)) {
    const p = profiles[id];
    assert.ok(p, id);
    identities.add([p.voice, p.pitch, p.tempo].join("|"));
    for (const action of ["select", "move", "attack"]) {
      const path = new URL(
        `../../public/${p.assetBase}-${action}.mp3`,
        import.meta.url,
      );
      assert.ok(existsSync(path), id);
      assert.ok(statSync(path).size > 1000, id);
      assert.ok(p.lines[action], id);
    }
  }
  assert.equal(identities.size, Object.keys(units).length);
});
