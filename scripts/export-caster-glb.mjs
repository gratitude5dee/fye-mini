// Export the character mesh from Standing Idle.fbx to a plain GLB for
// Meshy auto-rigging (mesh only — the rig, clips and textures are regenerated).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- minimal DOM shims so FBXLoader/GLTFExporter run under Node --------------
globalThis.self = globalThis;
globalThis.window = globalThis;
const listeners = new Map();
const noopImage = () => {
  const img = { addEventListener(){}, removeEventListener(){}, setAttribute(){} };
  Object.defineProperty(img, 'src', { set() { setTimeout(() => img.onerror?.(new Error('no images in node')), 0); }, get() { return ''; } });
  return img;
};
globalThis.document = {
  createElementNS: (_ns, tag) => tag === 'img' ? noopImage() : { getContext: () => null, style: {}, addEventListener(){} },
  createElement: (tag) => tag === 'img' ? noopImage() : { getContext: () => null, style: {}, addEventListener(){} },
  addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, removeChild() {} }
};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend?.(); }); }
};
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:noop';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fbxPath = path.join(root, 'public', 'models', 'Standing Idle.fbx');
const outPath = path.join(root, 'public', 'models', 'caster-mesh.glb');

const data = await readFile(fbxPath);
const loader = new FBXLoader();
const model = loader.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');

// Strip anything the exporter would try to serialize that we don't need:
// textures (unresolvable anyway) and the bundled idle clip — Meshy re-rigs
// the mesh and supplies its own skeleton and clips.
model.traverse((node) => {
  if (!node.isMesh && !node.isSkinnedMesh) return;
  const mats = Array.isArray(node.material) ? node.material : [node.material];
  for (const m of mats) {
    if (!m) continue;
    m.map = null; m.normalMap = null; m.bumpMap = null; m.emissiveMap = null;
    m.aoMap = null; m.metalnessMap = null; m.roughnessMap = null;
    m.alphaMap = null; m.envMap = null; m.lightMap = null; m.specularMap = null;
  }
});
model.animations = [];

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(model, { binary: true, onlyVisible: false });
await writeFile(outPath, Buffer.from(glb));
console.log('wrote', outPath, glb.byteLength, 'bytes');
