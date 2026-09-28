import * as THREE from 'three';
export function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.45, 0.8, 0.35).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){ float h = clamp(vDir.y, -0.1, 1.0);
        vec3 zenith = vec3(0.36, 0.56, 0.86); vec3 horizon = vec3(0.86, 0.86, 0.80); vec3 haze = vec3(0.93, 0.86, 0.72);
        vec3 c = mix(horizon, zenith, pow(h, 0.55)); c = mix(haze, c, clamp(h*6.0, 0.0, 1.0));
        float s = max(dot(vDir, sunDir), 0.0); c += vec3(1.0, 0.92, 0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat); m.frustumCulled = false; m.renderOrder = -10; return m;
}
