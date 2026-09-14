/**
 * Orbital context visualization
 * -------------------------------------------------------------
 * This is an explanatory 3D view, not a measured satellite tracker.
 * The live satellite layer remains the authoritative source for points.
 */

(() => {
  const canvas = document.getElementById('orbital-globe');
  if (!canvas || !window.THREE) return;

  const THREE = window.THREE;
  const stage = canvas.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.25, 5.2);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (error) {
    canvas.remove();
    const fallback = document.createElement('div');
    fallback.className = 'orbital-fallback';
    fallback.textContent = 'WEBGL UNAVAILABLE / VISUAL CONTEXT OFFLINE';
    stage.appendChild(fallback);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const root = new THREE.Group();
  root.rotation.x = -0.18;
  scene.add(root);

  scene.add(new THREE.AmbientLight(0x87a8c7, 1.25));
  const sun = new THREE.DirectionalLight(0x9bdcff, 2.2);
  sun.position.set(-3, 2, 4);
  scene.add(sun);

  function fallbackTexture() {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 1024;
    textureCanvas.height = 512;
    const ctx = textureCanvas.getContext('2d');
    ctx.fillStyle = '#071521';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#17394b';
    const shapes = [
      [[110, 125], [178, 96], [225, 125], [211, 180], [242, 238], [196, 287], [158, 244], [130, 194]],
      [[286, 104], [358, 87], [405, 124], [390, 186], [332, 202], [306, 164]],
      [[458, 92], [540, 74], [630, 103], [697, 166], [674, 223], [592, 209], [544, 257], [471, 210]],
      [[746, 257], [801, 230], [857, 259], [838, 310], [771, 326]],
      [[481, 301], [528, 277], [559, 324], [541, 391], [500, 426], [466, 372]]
    ];
    for (const shape of shapes) {
      ctx.beginPath();
      shape.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(97, 211, 240, 0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }
    return new THREE.CanvasTexture(textureCanvas);
  }

  const earthMaterial = new THREE.MeshPhongMaterial({
    color: 0x73c5df,
    emissive: 0x06131d,
    emissiveIntensity: 0.4,
    shininess: 8,
    map: fallbackTexture()
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1.42, 64, 48), earthMaterial);
  root.add(earth);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');
  textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    texture => {
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
    },
    undefined,
    () => {}
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.51, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x3fb6ff, transparent: true, opacity: 0.1, side: THREE.BackSide })
  );
  root.add(atmosphere);

  const orbitPoints = new THREE.EllipseCurve(0, 0, 2.05, 0.78, 0, Math.PI * 2, false, 0)
    .getPoints(128)
    .map(point => new THREE.Vector3(point.x, point.y, 0));
  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPoints),
    new THREE.LineBasicMaterial({ color: 0x7fe7c4, transparent: true, opacity: 0.7 })
  );
  orbit.rotation.x = 0.52;
  orbit.rotation.z = -0.28;
  root.add(orbit);

  const satellites = new THREE.Group();
  satellites.rotation.copy(orbit.rotation);
  root.add(satellites);
  [0.22, 2.4, 4.35].forEach((angle, index) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(index === 1 ? 0.075 : 0.045, 12, 8),
      new THREE.MeshBasicMaterial({ color: index === 1 ? 0xffd166 : 0xb9f7e2 })
    );
    marker.position.set(2.05 * Math.cos(angle), 0.78 * Math.sin(angle), 0.03);
    satellites.add(marker);
  });

  const starPositions = [];
  let seed = 17;
  for (let i = 0; i < 180; i += 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = ((seed / 233280) - 0.5) * 8;
    seed = (seed * 9301 + 49297) % 233280;
    const y = ((seed / 233280) - 0.5) * 5;
    seed = (seed * 9301 + 49297) % 233280;
    const z = ((seed / 233280) - 0.5) * 4 - 1;
    starPositions.push(x, y, z);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x8eb9c9, size: 0.018, transparent: true, opacity: 0.66 })));

  function resize() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function draw() {
    resize();
    renderer.render(scene, camera);
  }

  const resizeObserver = window.ResizeObserver ? new ResizeObserver(draw) : null;
  resizeObserver?.observe(stage);
  window.addEventListener('resize', draw, { passive: true });

  if (reducedMotion) {
    draw();
    return;
  }

  let lastTime = performance.now();
  function animate(now) {
    const delta = Math.min(50, now - lastTime);
    lastTime = now;
    earth.rotation.y += delta * 0.000035;
    satellites.rotation.y += delta * 0.000055;
    draw();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
