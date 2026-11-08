import type { PlacedSound, Position } from "../shared/protocol.js";
import { planetDistance } from "../shared/planet.js";
import { findSound } from "../shared/sounds.js";
import { soundLifeEffect, type WorldSoundExample } from "../shared/sound-life.js";

interface Options {
  at:()=>Position;
  sources:()=>readonly PlacedSound[];
  blueprints:()=>readonly WorldSoundExample[];
  enabled:()=>boolean;
  setEnabled:(enabled:boolean)=>void;
  listen:(id:string)=>Promise<boolean>;
  stop:()=>void;
  create:(id:string)=>void;
  watch?:(sourceId:string)=>boolean;
}
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,id:string,text?:string):HTMLElementTagNameMap[K]=>{const node=document.createElement(tag);node.id=id;if(text)node.textContent=text;return node;};
export class SoundDiscovery {
  readonly panel=element("aside","sound-discovery");
  private reopen=element("button","sound-discovery-reopen","See what sound changes");
  private origin=element("p","sound-discovery-origin");
  private title=element("strong","sound-discovery-title");
  private cause=element("p","sound-discovery-cause");
  private feedback=element("p","sound-discovery-feedback");
  private compare=element("button","sound-example-compare");
  private listen=element("button","sound-discovery-listen","Listen privately");
  private create=element("button","sound-discovery-create","Make it yours");
  private watch=element("button","sound-discovery-watch","Watch the boat");
  private sourceId="";
  private collapsed=false;
  private selected:WorldSoundExample|null=null;
  private revision=0;
  private audition=false;
  private signature="";
  private selectedSound="";
  private previewTimer:ReturnType<typeof setTimeout>|undefined;
  constructor(private host:HTMLElement,private opts:Options){
    this.panel.className="sound-discovery";this.panel.hidden=true;this.panel.setAttribute("aria-label","What sound changes here");
    this.reopen.type="button";this.reopen.hidden=true;this.reopen.className="sound-discovery-reopen";
    const close=element("button","sound-discovery-close","×");close.type="button";close.setAttribute("aria-label","Close sound discovery");
    close.onclick=()=>{this.collapsed=true;this.stop();this.frame();this.reopen.focus();};
    this.reopen.onclick=()=>{this.collapsed=false;this.frame();this.listen.focus();};
    this.feedback.setAttribute("role","status");
    this.listen.type=this.create.type=this.compare.type=this.watch.type="button";this.watch.hidden=true;
    this.listen.onclick=()=>{
      if(this.audition){this.stop();this.feedback.textContent="Private listen stopped.";return;}
      const revision=++this.revision;this.feedback.textContent="Loading your private listen…";
      void this.opts.listen(this.selectedSound).then(ok=>{if(revision!==this.revision||this.panel.hidden)return;this.audition=ok;this.listen.textContent=ok?"Stop listening":"Listen privately";this.feedback.textContent=ok?"Only your preview. The shared place has not changed.":"Try Listen again when the sound is available.";if(ok)this.previewTimer=setTimeout(()=>{if(revision===this.revision){this.audition=false;this.listen.textContent="Listen privately";}},5000);});
    };
    this.create.onclick=()=>{this.stop();this.opts.create(this.selectedSound);};
    this.watch.onclick=()=>{this.stop();if(this.opts.watch?.(this.sourceId)){this.collapsed=true;this.frame();}else this.feedback.textContent=this.selectedSound==="harbour-boat"?"The boat is not visible here yet. Try again beside the coast.":"Leave this sound near its water first: frogs at the pool, fish at the pool or shore, whales at the coast.";};
    this.compare.onclick=()=>{this.stop();this.opts.setEnabled(!this.opts.enabled());this.signature="";this.frame();};
    const buttons=element("div","sound-discovery-actions");buttons.append(this.listen,this.create,this.watch,this.compare);
    this.panel.append(close,this.origin,this.title,this.cause,buttons,this.feedback);host.append(this.panel,this.reopen);
  }
  private stop():void{clearTimeout(this.previewTimer);this.revision++;this.audition=false;this.listen.textContent="Listen privately";this.feedback.textContent="";this.opts.stop();}
  frame():void{
    const nearest=this.opts.blueprints().map(example=>({example,distance:planetDistance(this.opts.at(),example)})).sort((a,b)=>a.distance-b.distance)[0];
    const selected=nearest&&nearest.distance<=8?nearest.example:null;
    const modal=!!document.querySelector("dialog:modal")||!document.getElementById("planet-chat")?.hidden;
    if(modal){
      if(!this.panel.hidden)this.stop();
      this.panel.hidden=true;this.reopen.hidden=true;
      return;
    }
    this.panel.hidden=!selected||this.collapsed||modal;this.reopen.hidden=!selected||!this.collapsed||modal;
    if(!selected){if(this.selected){this.stop();this.selected=null;}return;}
    if(this.selected?.id!==selected.id){this.stop();this.feedback.textContent="";this.signature="";}this.selected=selected;
    const real=this.opts.sources().filter(source=>!source.whileIn&&!source.removedAt&&planetDistance(source,selected)<=8&&
      (selected.kind==="coffee"?["espresso","cafe-chatter","cafe-dishes","cafe-music","guitar","chorus-chords","chorus-pulse","chorus-bells"].includes(source.soundId):selected.kind==="gulls"?["coastal-gulls","harbour-boat","pond-bubbles","pond-frogs","whale-song"].includes(source.soundId):source.soundId===selected.soundId))
      .sort((a,b)=>selected.kind==="gulls"?b.at.localeCompare(a.at)||a.id.localeCompare(b.id):planetDistance(a,selected)-planetDistance(b,selected)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id))[0];
    const signature=[selected.id,real?.id,real?.soundId,this.opts.enabled()].join(":");if(signature===this.signature)return;this.signature=signature;
    const nextSound=real?.soundId??selected.soundId;if(nextSound!==this.selectedSound)this.stop();this.selectedSound=nextSound;
    this.origin.textContent=real?`By ${real.by} · shared sound`:this.opts.enabled()?"World example · local demonstration":"World example · paused for you";
    this.title.textContent=findSound(this.selectedSound)?.label??selected.title;
    this.cause.textContent=soundLifeEffect(this.selectedSound)??selected.effect;
    const watchLabel=real&&({"harbour-boat":"Watch the boat","pond-bubbles":"Watch the fish","pond-frogs":"Watch the frogs","whale-song":"Watch the whale"} as Record<string,string>)[real.soundId];
    this.sourceId=real?.id??"";this.watch.hidden=!this.opts.watch||!watchLabel;this.watch.textContent=watchLabel??"Watch the boat";
    this.compare.textContent=this.opts.enabled()?"Pause examples":"Show examples";this.compare.setAttribute("aria-pressed",String(this.opts.enabled()));
    this.compare.title="Only world demonstrations change. Your friends' sounds stay.";
    this.panel.dataset.source=real?.id??selected.id;this.panel.dataset.origin=real?"player":"example";
    this.panel.dataset.exampleEnabled=String(this.opts.enabled());
  }
  dispose():void{this.stop();this.panel.remove();this.reopen.remove();}
}
