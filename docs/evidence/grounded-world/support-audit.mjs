import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const buildDir = resolve(repo, process.env.BUILD_DIR ?? '.cache/support-review/after-dist');
const { buildPlanet, onPlanet } = await import(pathToFileURL(resolve(buildDir, 'client/planet-build.js')).href);
const { AnimalFigure } = await import(pathToFileURL(resolve(buildDir, 'client/characters.js')).href);
const { PLANET_RADIUS: R, PLANET_PLACES, planetPoint, planetNormal, planetBasis } = await import(pathToFileURL(resolve(buildDir, 'shared/planet.js')).href);
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
const world = buildPlanet();world.root.updateMatrixWorld(true);
const frame = typeof world.supportAt === 'function' ? (await import(pathToFileURL(resolve(buildDir, 'client/planet-support.js')).href)).supportedPlanetFrame : null;
const vec = p => new THREE.Vector3(p.x, p.y, p.z);
const all = [];world.root.traverse(o => { if (o instanceof THREE.Mesh) all.push(o); });
const earth = all.filter(o => o.geometry instanceof THREE.SphereGeometry && o.geometry.parameters.radius === R);
const ground = all.filter(o => earth.includes(o) || o.geometry.userData.surfacePatch || o.geometry.userData.continuousRoad || o.name === 'soundfolk-beach');
const floors = all.filter(o => {
    if (o.userData.supportSurface || ['cafe-terrace-floor', 'washroom-tiled-floor', 'shower-tray'].includes(o.name)) return true;
    if (o.geometry instanceof THREE.BoxGeometry) { const p = o.geometry.parameters;return p.width === 5 && p.height === .18 && p.depth === 4.4 || p.width === 3.1 && p.height === .15 && p.depth === 3.1; }
    if (o.geometry instanceof THREE.CylinderGeometry) { const p = o.geometry.parameters;return p.radiusTop === 3.1 && p.height === .22 || p.radiusTop === 2.4 && p.height === .25; }
    return false;
});
const foots = all.filter(o => { if (!(o.geometry instanceof THREE.BoxGeometry)) return false;const p = o.geometry.parameters;return p.width === .1 && p.depth === .44 || p.width === .14 && p.depth === .14; });
const feet = foots.map(foot => {
    const p = foot.geometry.parameters, up = new THREE.Vector3().setFromMatrixColumn(foot.matrixWorld, 1).normalize();
    const at = (x, z) => {
        const bottom = new THREE.Vector3(x, -p.height / 2, z).applyMatrix4(foot.matrixWorld);
        const hit = new THREE.Raycaster(bottom.clone().addScaledVector(up, .75), up.clone().negate()).intersectObjects([...ground, ...floors], false)[0];
        return { gap: hit ? hit.distance - .75 : null, support: hit?.object.name ?? 'earth', point: bottom.toArray() };
    };
    const corners = [-p.width/2,p.width/2].flatMap(x => [-p.depth/2,p.depth/2].map(z => at(x,z)));
    const ancestors = [];for (let o=foot;o;o=o.parent) if (o.name) ancestors.push(o.name);
    return { kind: p.width === .1 ? 'bench' : 'lantern', ancestors, center: at(0,0), corners, minCornerGap: Math.min(...corners.map(c=>c.gap)), maxCornerGap: Math.max(...corners.map(c=>c.gap)) };
});
const coordinate = v => ({ x: Math.atan2(v.x, v.z) * R, z: -Math.asin(v.y / v.length()) * R });
const local = (center,x,z) => { const b=planetBasis(center.x,center.z);return coordinate(vec(planetPoint(center.x,center.z)).addScaledVector(vec(b.east),x).addScaledVector(vec(b.south),z)); };
const cafe=PLANET_PLACES.find(p=>p.kind==='tea'), stage=PLANET_PLACES.find(p=>p.kind==='stage');
const cases=[['cafe-center',local(cafe,0,0)],['cafe-outer',local(cafe,4.5,2.3)],['cafe-front',local(cafe,0,4.4)],['stage',local(stage,1.7,.5)],['restroom-tiles',local({x:13.5,z:5.5},.3,.3)],['shower-tray',local({x:18,z:5.5},-.37,-.58)]];
const actors=cases.map(([name,p])=>{
    const hit=new THREE.Raycaster(vec(planetPoint(p.x,p.z,3)),vec(planetNormal(p.x,p.z)).negate()).intersectObjects(floors,false).find(h=>(h.face?.normal.y??0)>.99);
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const support=world.supportAt?.(p.x,p.z)??{height:world.heightAt(p.x,p.z),normal:planetNormal(p.x,p.z),id:'legacy'};
    const figure=new AnimalFigure({avatar:'cat',seed:'physical-contact',pose:'stand',role:'player'});figure.setMotion(0,false);
    if(frame){figure.position.copy(vec(planetPoint(p.x,p.z,support.height)));figure.quaternion.copy(frame(p.x,p.z,.7,support.normal));}
    else onPlanet(figure,p.x,p.z,support.height,.7);
    figure.updateMatrixWorld(true);
    const shoeGaps={};for(const shoeName of['left-shoe','right-shoe']){const shoe=figure.getObjectByName(shoeName),a=shoe.geometry.getAttribute('position'),gaps=[];for(let i=0;i<a.count;i++)if(a.getY(i)<-.0439)gaps.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(shoe.matrixWorld).sub(hit.point).dot(normal));shoeGaps[shoeName]={min:Math.min(...gaps),max:Math.max(...gaps),vertices:gaps.length};}
    const actorUp=new THREE.Vector3(0,1,0).applyQuaternion(figure.quaternion);
    return{name,position:p,support:support.id,actualFloor:hit.object.name,height:support.height,normalErrorDegrees:THREE.MathUtils.radToDeg(actorUp.angleTo(normal)),originGap:figure.position.clone().sub(hit.point).dot(normal),shoeGaps};
});
const foundations=all.filter(o=>o.geometry.userData.groundFoundation);
const foundationAudit=foundations.map(o=>{const a=o.geometry.getAttribute('position'),r=[];for(let i=1;i<a.count;i+=2)r.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).length());return{id:o.name,vertices:a.count,triangles:o.geometry.index.count/3,minBaseRadius:Math.min(...r),maxBaseRadius:Math.max(...r)};});
const terrace=world.root.getObjectByName('cafe-terrace-floor'),up=new THREE.Vector3().setFromMatrixColumn(terrace.matrixWorld,1).normalize(),deckEdge=[];
for(const [x,z]of [[-5.8,-3.6],[5.8,-3.6],[-5.8,3.6],[5.8,3.6],[0,3.6]]){
    const top=new THREE.Vector3(x,-.06,z).applyMatrix4(terrace.matrixWorld),hit=new THREE.Raycaster(top.clone().addScaledVector(up,.1),up.clone().negate()).intersectObjects(earth,false)[0];deckEdge.push({x,z,floorUndersideToEarth:hit.distance-.1});
}
const output={kind:'isolated actual mesh/standing-sole audit',buildDir,gpu:false,database:false,signCanvasRasterisationStubbed:true,supportAPI:!!frame,feet,actors,deckEdge,foundations:foundationAudit,foundationTotals:{count:foundations.length,vertices:foundationAudit.reduce((n,f)=>n+f.vertices,0),triangles:foundationAudit.reduce((n,f)=>n+f.triangles,0)},contactAnchors:world.contactAnchors?.length??0,glassCastCount:all.filter(o=>o.material instanceof THREE.MeshStandardMaterial&&o.material.transparent&&o.material.opacity<.65&&o.castShadow).length};
const target=resolve(repo,process.env.OUTPUT??'.cache/support-review/after-final.json');writeFileSync(target,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({output:target,supportAPI:output.supportAPI,maxBenchCornerGap:Math.max(...feet.filter(f=>f.kind==='bench').map(f=>f.maxCornerGap)),maxLanternCornerGap:Math.max(...feet.filter(f=>f.kind==='lantern').map(f=>f.maxCornerGap)),maxActorSoleGap:Math.max(...actors.flatMap(a=>Object.values(a.shoeGaps).flatMap(g=>[Math.abs(g.min),Math.abs(g.max)]))),foundations:output.foundationTotals,contactAnchors:output.contactAnchors,glassCastCount:output.glassCastCount},null,2));world.dispose();
