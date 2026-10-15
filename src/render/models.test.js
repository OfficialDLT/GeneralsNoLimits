import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { units, buildings } from "../config/index.js";
import profiles from "../config/voice-profiles.json" with { type: "json" };
import { entityModel } from "./models.js";
import { existsSync, statSync } from "node:fs";
test("every catalog model has finite geometry, raycastable faces and bounded draw calls", () => {
  for (const [type, d] of Object.entries({ ...units, ...buildings })) {
    const model = entityModel(type, d, "#63b9ff");
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
      }
    });
    const box = new THREE.Box3().setFromObject(model),
      size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0, type);
    assert.ok(Math.max(size.x, size.y, size.z) < 150, type);
    assert.ok(count <= 3, type);
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
