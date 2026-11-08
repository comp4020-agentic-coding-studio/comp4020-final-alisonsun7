// A small wordless turn cue. It identifies an NPC gesture, never a message
// from a real player, an audio source, or a stored conversation.
import * as THREE from "three";

export class NpcConversationCues {
    private texture:THREE.CanvasTexture;
    private cues=new Map<THREE.Object3D,THREE.Sprite>();
    constructor(){
        const canvas=document.createElement("canvas");canvas.width=128;canvas.height=64;
        const ctx=canvas.getContext("2d")!;
        ctx.fillStyle="#f5efda";ctx.strokeStyle="#789184";ctx.lineWidth=3;
        ctx.beginPath();ctx.roundRect(3,3,122,48,22);ctx.fill();ctx.stroke();
        ctx.fillStyle="#f5efda";ctx.beginPath();ctx.moveTo(50,47);ctx.lineTo(58,62);ctx.lineTo(70,47);ctx.fill();
        ctx.fillStyle="#3d6157";for(const x of [39,64,89]){ctx.beginPath();ctx.arc(x,27,5,0,Math.PI*2);ctx.fill();}
        this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    }
    add(figure:THREE.Object3D):void {
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture,depthWrite:false,transparent:true}));
        sprite.name="npc-conversation-turn";sprite.position.set(0,1.92,0);sprite.scale.set(.7,.35,1);sprite.visible=false;
        figure.add(sprite);this.cues.set(figure,sprite);
    }
    update(figure:THREE.Object3D,serverNow:number,reducedMotion:boolean):void {
        const sprite=this.cues.get(figure);if(!sprite)return;
        const life=figure.userData.residentLife;sprite.visible=life?.role==="speaking"&&!life?.walking;
        sprite.material.opacity=reducedMotion?1:.88+.12*Math.sin(serverNow/300);
    }
    dispose():void {for(const sprite of this.cues.values()){sprite.removeFromParent();sprite.material.dispose();}this.cues.clear();this.texture.dispose();}
}
