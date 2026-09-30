import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Asset } from '../../shared/domain';

export function ModelPreview({ asset }: { asset: Asset }) {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Loading model…');
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abort = new AbortController();
    let stopped = false;
    let renderer: THREE.WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      root: THREE.Object3D | undefined;
    let observer: ResizeObserver | undefined;
    const dispose = (object: THREE.Object3D) =>
      object.traverse((item) => {
        if (item instanceof THREE.Mesh) {
          item.geometry.dispose();
          for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
            for (const value of Object.values(material))
              if (value instanceof THREE.Texture) {
                value.dispose();
                if (value.image instanceof ImageBitmap) value.image.close();
              }
            material.dispose();
          }
        }
      });
    setMessage('Loading model…');
    void (async () => {
      const response = await fetch(asset.url, { signal: abort.signal });
      if (!response.ok) throw new Error('Managed model could not be opened.');
      const bytes = await response.arrayBuffer();
      const view = new DataView(bytes);
      if (
        bytes.byteLength < 20 ||
        view.getUint32(0, true) !== 0x46546c67 ||
        view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== bytes.byteLength ||
        view.getUint32(16, true) !== 0x4e4f534a
      )
        throw new Error('Invalid GLB model.');
      const length = view.getUint32(12, true);
      if (length > bytes.byteLength - 20) throw new Error('Invalid GLB metadata.');
      const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
      if (
        [...(metadata.buffers || []), ...(metadata.images || [])].some(
          (entry: { uri?: string }) => entry.uri,
        )
      )
        throw new Error('Model must contain embedded textures and geometry.');
      const gltf = await new GLTFLoader().parseAsync(bytes, '');
      if (stopped) {
        dispose(gltf.scene);
        return;
      }
      root = gltf.scene;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(root);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 3));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(3, 4, 5);
      scene.add(light);
      const box = new THREE.Box3().setFromObject(root),
        center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
      root.position.sub(center);
      const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
      camera.position.set(radius * 1.8, radius * 0.9, radius * 2.2);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, container.clientWidth),
          height = Math.max(1, container.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      renderer.setAnimationLoop(() => {
        controls?.update();
        renderer?.render(scene, camera);
      });
      let triangles = 0;
      root.traverse((item) => {
        if (item instanceof THREE.Mesh)
          triangles += (item.geometry.index?.count || item.geometry.attributes.position.count) / 3;
      });
      setMessage(
        `${Math.round(triangles).toLocaleString()} triangles · Drag to rotate · Scroll to zoom`,
      );
    })().catch((error) => {
      if (!stopped) setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => {
      stopped = true;
      abort.abort();
      observer?.disconnect();
      controls?.dispose();
      renderer?.setAnimationLoop(null);
      if (root) dispose(root);
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [asset.id, asset.url]);
  return (
    <div className="model-preview" aria-label="3D model preview">
      <div className="model-viewport" ref={host} />
      <div className="model-preview-status">{message}</div>
    </div>
  );
}
