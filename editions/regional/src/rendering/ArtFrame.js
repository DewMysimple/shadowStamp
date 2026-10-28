import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getExhibitionLayout } from '../config.js';
import { createFrameStudio } from './FrameStudio.js';
import { createFrameDisplay } from './FrameDisplay.js';

export const FRAME_CATEGORIES = Object.freeze([
  { id: 'guangdong', name: 'Category_Guangdong', label: '广东' },
  { id: 'china', name: 'Category_China', label: '中国' },
  { id: 'world', name: 'Category_World', label: '世界' },
]);

/** A second view, using the gallery's renderer and demand-driven animation clock. */
export function createArtFrame({ renderer, wake, onCategory, onStatus }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.55, .55, .3, -.3, .1, 10);
  camera.position.set(0, 0, 2);
  const root = new THREE.Group();
  // A sub-degree presentation angle also avoids the LTC tangent singularity
  // for a perfectly parallel orthographic view of a completely flat print.
  root.rotation.set(-.004, -.003, 0);
  scene.add(root);
  const studio = createFrameStudio(renderer);
  const display = createFrameDisplay();
  scene.environmentIntensity = .2;
  scene.environmentRotation.y = Math.PI * .35;
  scene.add(...studio.lights);
  const key = new THREE.DirectionalLight(0xfffaf2, .12);
  key.position.set(-.45, .8, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -.65, right: .65, top: .4, bottom: -.4, near: .1, far: 8 });
  key.shadow.bias = -.00005;
  key.shadow.normalBias = .00015;
  key.shadow.radius = 14;
  key.shadow.blurSamples = 16;
  scene.add(key);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .8), new THREE.ShadowMaterial({ opacity: .22, depthWrite: false }));
  shadow.position.z = -.026;
  shadow.receiveShadow = true;
  scene.add(shadow);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;

  let disposed = false, loaded = false, status = 'loading', selected = 'guangdong', hovered = null;
  let keyboard = false, time = 0, progress = 0, reduced = false, width = 1, height = 1;
  let viewport = getExhibitionLayout(1, 1).frame;
  let renderViewport = { ...viewport };
  const categories = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const point = new THREE.Vector3();
  const baseColor = new THREE.Color('#453e34');
  const accentColor = new THREE.Color('#984f3c');
  const materialSet = new Set();
  const hitTargets = [];
  const roots = [];

  function disposeObjects(object) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    object.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const mat of [].concat(node.material || [])) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose());
    textures.forEach(t => { t.dispose(); t.source.data?.close?.(); });
    materials.forEach(m => m.dispose());
  }

  function collect(object) {
    object.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = !node.name.endsWith('_HitArea');
      node.receiveShadow = !node.name.endsWith('_HitArea');
      for (const mat of [].concat(node.material || [])) {
        display.apply(mat);
        mat.userData.frameBaseOpacity = mat.opacity;
        mat.userData.frameTransparent = mat.transparent;
        materialSet.add(mat);
        if (mat.map) mat.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
    });
  }

  const loader = new GLTFLoader();
  Promise.allSettled([
    loader.loadAsync('/models/art-frame-original.glb'),
    loader.loadAsync('/models/frame-typography.glb'),
    studio.ready,
    display.ready,
  ]).then(results => {
    if (disposed || results.some(result => result.status === 'rejected')) {
      for (const result of results) if (result.status === 'fulfilled' && result.value?.scene) disposeObjects(result.value.scene);
      studio.dispose(); display.dispose();
      if (!disposed) { status = 'error'; onStatus({ status, message: '相框暂时未能加载，请重新载入。' }); wake(); }
      return;
    }
    const [frame, typography] = results.slice(0, 2).map(result => result.value.scene);
    scene.environment = results[2].value;
    roots.push(frame, typography);
    frame.traverse(node => { if (node.name.startsWith('Text_')) node.visible = false; });
    frame.updateMatrixWorld(true);
    typography.updateMatrixWorld(true);
    const replacedMaterials = new Set();
    for (const [index, spec] of FRAME_CATEGORIES.entries()) {
      const text = typography.getObjectByName(spec.name);
      if (!text?.isMesh) throw new Error(`Missing 3D category: ${spec.name}`);
      const bounds = new THREE.Box3().setFromObject(text);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.name = spec.name;
      typography.add(pivot);
      pivot.attach(text);
      text.name = `${spec.name}_Geometry`;
      replacedMaterials.add(text.material);
      text.material = text.material.clone();
      text.material.color.copy(baseColor);
      text.material.roughness = .78;
      // Keep the reveal in the transparent list through its final frame.
      // Switching lists at opacity=1 can leave a stale first-paint depth pass.
      text.material.transparent = true;
      text.material.depthWrite = false;
      // Transparent per-category hit volumes enlarge glyph counters for touch.
      // They are raycast meshes in the same local space, never a frame-wide hit.
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.18, size.x + .055), .12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.name = `${spec.name}_HitArea`;
      hit.userData.category = spec.id;
      hit.position.z = .003;
      pivot.add(hit);
      hitTargets.push(hit);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(.05, .0012, .0007),
        new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0, depthWrite: false }));
      mark.position.set(0, -.016, .001);
      pivot.add(mark);
      categories.push({ ...spec, index, pivot, text, hit, mark, base: center.clone(), activity: 0, reveal: 0 });
    }
    replacedMaterials.forEach(material => material.dispose());
    root.add(frame, typography);
    collect(root);
    loaded = true; status = 'ready'; time = 0;
    renderer.shadowMap.needsUpdate = true;
    onStatus({ status });
    wake();
  }).catch(error => {
    if (disposed) return;
    roots.forEach(disposeObjects);
    roots.length = 0;
      studio.dispose(); display.dispose();
    root.clear();
    status = 'error'; onStatus({ status, message: `相框暂时未能加载：${error.message}` }); wake();
  });

  function hover(id, fromKeyboard = false) {
    if (hovered === id && keyboard === fromKeyboard) return;
    hovered = id; keyboard = fromKeyboard; wake();
  }

  function pick(x, y) {
    if (!loaded || progress > .05 || x < viewport.x || x > viewport.x + viewport.width
      || y < viewport.y || y > viewport.y + viewport.height) return null;
    pointer.set((x - renderViewport.x) / renderViewport.width * 2 - 1, 1 - (y - renderViewport.y) / renderViewport.height * 2);
    raycaster.setFromCamera(pointer, camera);
    scene.updateMatrixWorld(true);
    return raycaster.intersectObjects(hitTargets, false)[0]?.object.userData.category ?? null;
  }

  return {
    resize(w, h) {
      width = w; height = h;
      viewport = getExhibitionLayout(w, h).frame;
      // Overscan keeps the soft shadow from ending at the view's rectangle,
      // while the physical frame retains the exact requested screen size.
      const pad = Math.max(24, viewport.width * .07);
      renderViewport = { x: viewport.x - pad, y: viewport.y - pad,
        width: viewport.width + pad * 2, height: viewport.height + pad * 2 };
      const aspect = viewport.width / viewport.height;
      const viewHeight = Math.max(.535, 1.05 / aspect);
      camera.left = -viewHeight * aspect / 2 * renderViewport.width / viewport.width;
      camera.right = -camera.left;
      camera.top = viewHeight / 2 * renderViewport.height / viewport.height;
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    },
    setSeries(id) { selected = id; wake(); },
    hover,
    pointer(x, y) { const id = pick(x, y); hover(id); return id; },
    click(x, y) { const id = pick(x, y); if (id) onCategory(id); return id; },
    update(dt, focusProgress, reducedMotion) {
      progress = focusProgress; reduced = reducedMotion;
      if (!loaded) return false;
      time += dt;
      let moving = false;
      for (const entry of categories) {
        const active = entry.id === hovered ? 1 : entry.id === selected ? .62 : 0;
        const factor = reduced ? 1 : 1 - Math.exp(-dt / .075);
        entry.activity += (active - entry.activity) * factor;
        if (Math.abs(entry.activity - active) < .0005) entry.activity = active;
        else moving = true;
        const reveal = reduced ? 1 : THREE.MathUtils.smoothstep(time - .12 - entry.index * .11, 0, .4);
        if (reveal < 1) moving = true;
        entry.reveal = reveal;
        entry.pivot.position.z = entry.base.z + entry.activity * .004 - (1 - reveal) * .002;
        entry.pivot.scale.setScalar(1 + entry.activity * .035);
        entry.text.material.color.copy(baseColor).lerp(accentColor, Math.min(1, entry.activity * 1.5));
        entry.text.material.opacity = (1 - progress) * reveal;
        entry.mark.material.opacity = (1 - progress) * reveal * (entry.id === selected ? .8 : keyboard && entry.id === hovered ? .55 : 0);
      }
      for (const mat of materialSet) {
        // Category meshes have their own staggered reveal; the rest fades with focus.
        if (!categories.some(entry => entry.text.material === mat || entry.mark.material === mat)) mat.opacity = mat.userData.frameBaseOpacity * (1 - progress);
        const transparent = mat.userData.frameTransparent || mat.opacity < .999;
        if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
      }
      if (moving) renderer.shadowMap.needsUpdate = true;
      return moving;
    },
    render() {
      if (!loaded || progress > .999) return;
      const previousToneMapping = renderer.toneMapping;
      const previousExposure = renderer.toneMappingExposure;
      // Keep the stamp shader's established display pipeline untouched.
      try {
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 2 ** .4;
        renderer.setViewport(renderViewport.x, height - renderViewport.y - renderViewport.height, renderViewport.width, renderViewport.height);
        renderer.setScissor(renderViewport.x, height - renderViewport.y - renderViewport.height, renderViewport.width, renderViewport.height);
        renderer.setScissorTest(true);
        renderer.clearDepth();
        renderer.render(scene, camera);
      } finally {
        renderer.toneMapping = previousToneMapping;
        renderer.toneMappingExposure = previousExposure;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
      }
    },
    getDiagnostics() {
      scene.updateMatrixWorld(true);
      const modelBounds = roots[0] ? new THREE.Box3().setFromObject(roots[0]) : null;
      const frameCorners = modelBounds ? [modelBounds.min, modelBounds.max].flatMap(a => [modelBounds.min, modelBounds.max].flatMap(b => [modelBounds.min, modelBounds.max].map(c => {
        const p = new THREE.Vector3(a.x, b.y, c.z).project(camera);
        return [renderViewport.x + (p.x + 1) * renderViewport.width / 2, renderViewport.y + (1 - p.y) * renderViewport.height / 2];
      }))) : [];
      return { status, loaded, selected, hovered, keyboard, viewport, renderViewport, reducedMotion: reduced,
        modelSizeM: modelBounds?.getSize(new THREE.Vector3()).toArray(), frameCorners,
        categories: categories.map(entry => {
          entry.pivot.getWorldPosition(point).project(camera);
          return { id: entry.id, name: entry.name, activity: entry.activity, reveal: entry.reveal,
            position: entry.pivot.position.toArray(), base: entry.base.toArray(), scale: entry.pivot.scale.x,
            color: `#${entry.text.material.color.getHexString()}`,
            opacity: entry.text.material.opacity, visible: entry.text.visible,
            bounds: new THREE.Box3().setFromObject(entry.text).getSize(new THREE.Vector3()).toArray(),
            depth: new THREE.Box3().setFromObject(entry.text).getCenter(new THREE.Vector3()).z,
            screen: [renderViewport.x + (point.x + 1) * renderViewport.width / 2, renderViewport.y + (1 - point.y) * renderViewport.height / 2],
            vertices: entry.text.geometry.attributes.position.count };
        }),
        roots: roots.map(object => object.uuid),
        studio: { environment: Boolean(scene.environment), environmentIntensity: scene.environmentIntensity,
          hdri: { ...studio.source }, environmentRotation: scene.environmentRotation.toArray(),
          toneMapping: 'Source AgX Medium High Contrast LUT', exposure: 2 ** .4, shadow: 'VSM', softboxes: studio.softboxes,
          invisibleHitAreasCastShadows: hitTargets.some(mesh => mesh.castShadow) },
        materials: [...materialSet].filter(mat => mat.isMeshStandardMaterial).map(mat => ({ name: mat.name, type: mat.type,
          displayTransform: Boolean(mat.userData.frameDisplay),
          roughness: mat.roughness, metalness: mat.metalness, normalScale: mat.normalScale.toArray(),
          maps: ['map', 'normalMap', 'roughnessMap'].map(key => ({ key, name: mat[key]?.name,
            colorSpace: mat[key]?.colorSpace, channel: mat[key]?.channel, repeat: mat[key]?.repeat.toArray(),
            minFilter: mat[key]?.minFilter, mipmaps: mat[key]?.generateMipmaps })) })),
        hiddenOriginalTexts: roots[0] ? (() => { const list = []; roots[0].traverse(node => { if (node.name.startsWith('Text_')) list.push({ name: node.name, visible: node.visible }); }); return list; })() : [] };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObjects(scene);
      key.shadow.dispose();
      studio.dispose();
      display.dispose();
      scene.clear(); roots.length = 0; categories.length = 0; materialSet.clear(); hitTargets.length = 0;
    },
  };
}
