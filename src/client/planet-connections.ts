// Actual public reply relationships follow the globe, never a chord through it.
import * as THREE from "three";
import { planetDistance, planetPoint, PLANET_RADIUS } from "../shared/planet.js";
import { findSound, FAMILIES, PLACE_MAX } from "../shared/sounds.js";
import type { PlacedSound } from "../shared/protocol.js";

export class PlanetSoundConnections {
  private group = new THREE.Group();
  private links: { from: PlacedSound; to: PlacedSound; line: THREE.Line }[] = [];
  private disposed = false;
  constructor(root: THREE.Object3D, private heightAt: (x: number, z: number) => number) {
    this.group.name = "planet-sound-conversations";
    root.add(this.group);
  }
  setAll(sounds: readonly PlacedSound[]): void {
    if (this.disposed) return;
    this.clear();
    const live = new Map(sounds.filter(s => !s.whileIn && !s.removedAt && findSound(s.soundId)).map(s => [s.id, s]));
    for (const child of [...live.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
      const parent = live.get(child.replyToId ?? child.replyTo?.id ?? "");
      if (!parent || parent.id === child.id || child.replyTo?.removedAt || (child.replyTo && child.replyTo.id !== parent.id)) continue;
      const distance = planetDistance(parent, child);
      if (distance < .03 || distance > 32 || this.links.length >= PLACE_MAX) continue;
      const a = planetPoint(parent.x, parent.z), b = planetPoint(child.x, child.z);
      const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z);
      const positions: number[] = [], colours: number[] = [];
      const c1 = new THREE.Color(FAMILIES[findSound(parent.soundId)!.family].colour), c2 = new THREE.Color(FAMILIES[findSound(child.soundId)!.family].colour);
      const startHeight = this.heightAt(parent.x, parent.z), endHeight = this.heightAt(child.x, child.z);
      for (let i = 0; i <= 32; i++) {
        const t = i / 32, height = .12 + startHeight * (1 - t) + endHeight * t + Math.sin(Math.PI * t) * Math.min(.9, .25 + distance * .045);
        from.clone().lerp(to, t).normalize().multiplyScalar(PLANET_RADIUS + height).toArray(positions, i * 3);
        c1.clone().lerp(c2, t).lerp(new THREE.Color(0xfff3cc), .25).toArray(colours, i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
      const line = new THREE.Line(geometry, material);
      line.name = "reply-to-" + parent.id;
      line.userData.soundId = child.id;
      this.group.add(line);
      this.links.push({ from: parent, to: child, line });
    }
  }
  frame(listener: { x: number; z: number }): number {
    if (this.disposed) return 0;
    let count = 0;
    for (const link of this.links) {
      link.line.visible = planetDistance(listener, link.from) <= 18 || planetDistance(listener, link.to) <= 18;
      if (link.line.visible) count++;
    }
    return count;
  }
  private clear(): void {
    for (const { line } of this.links) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      line.removeFromParent();
    }
    this.links = [];
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clear(); this.group.removeFromParent(); }
}
