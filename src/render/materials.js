import * as THREE from 'three';

// World-space projection survives geometry merging and avoids hundreds of material draws.
export function applyWeathering(material, texture) {
  material.onBeforeCompile = shader => {
    shader.uniforms.armorSurface = { value: texture };
    shader.vertexShader = 'varying vec3 surfacePosition; varying vec3 surfaceNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nsurfacePosition = position; surfaceNormal = normal;');
    shader.fragmentShader = 'uniform sampler2D armorSurface; varying vec3 surfacePosition; varying vec3 surfaceNormal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 weights = pow(abs(normalize(surfaceNormal)), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.0001);
      vec3 surface = texture2D(armorSurface, surfacePosition.yz * 0.12).rgb * weights.x
        + texture2D(armorSurface, surfacePosition.xz * 0.12).rgb * weights.y
        + texture2D(armorSurface, surfacePosition.xy * 0.12).rgb * weights.z;
      diffuseColor.rgb *= mix(vec3(0.72), vec3(1.12), surface);
    `);
  };
  material.customProgramCacheKey = () => 'weathered-triplanar-v1';
}
