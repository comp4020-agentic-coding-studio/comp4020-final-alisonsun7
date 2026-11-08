#!/usr/bin/env node
// Real Worker + real isolated Node/SQLite, with transport mapped to loopback.
// This is deliberately not a cloud multi-user test and cannot touch production.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const repo=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
assert.ok(repo.endsWith("/comp4020-final-alisonsun7"));
const workerPath="/Users/steveluo/Documents/ChatGPT/Alison/sites/little-chorus-playtest/worker/index.js";
const workerSource=readFileSync(workerPath,"utf8");
const worker=(await import("data:text/javascript;base64,"+Buffer.from(workerSource).toString("base64"))).default;
const UPSTREAM="https://comp4020-final-alisonsun7.fly.dev",LOCAL="http://127.0.0.1:18954",SITE="https://little-chorus-playtest-20261108.crazylife5.chatgpt.site";
const out=join(dirname(fileURLToPath(import.meta.url)),"run-"+new Date().toISOString().replace(/[:.]/g,"-"));mkdirSync(out,{recursive:true});
const dbPath=join(out,"isolated-history.db");assert.ok(!existsSync(dbPath));
const report={kind:"transport-local-real-Worker-Node-SQLite-integration",startedAt:new Date().toISOString(),upstreamOriginMapped:UPSTREAM,localBackend:LOCAL,workerSha256:createHash("sha256").update(workerSource).digest("hex"),sourceCommit:"051919702514877d892f6f79ecf0f60d39a024c5",dbPath,limitations:["All writes go only to a new localhost:18954 SQLite database; no cloud write or production identity is created","Two programmatic cookie jars exercise real HTTP authentication, not browser UI or human playtesting","Local listening preference and audible output are not exercised"],checks:[],requests:[],blockedNetwork:[],passed:false};
const check=(v,label)=>{assert.ok(v,label);report.checks.push(label);console.log("ok "+label);};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
  if(url.origin!==UPSTREAM){report.blockedNetwork.push({origin:url.origin,path:url.pathname,method:request.method});throw new Error("Unapproved network origin");}
  const local=new URL(LOCAL);local.pathname=url.pathname;local.search=url.search;
  report.requests.push({method:request.method,path:url.pathname,cookiePresent:request.headers.has("cookie")});
  return nativeFetch(new Request(local,{method:request.method,headers:request.headers,body:["GET","HEAD"].includes(request.method)?undefined:request.body,duplex:"half",redirect:"manual",signal:request.signal}));
};
const logFd=openSync(join(out,"backend.log"),"a");
const child=spawn(process.execPath,[join(repo,"dist/server.js")],{cwd:repo,env:{...process.env,PORT:"18954",DB_PATH:dbPath,NODE_ENV:"production"},stdio:["ignore",logFd,logFd]});
report.backendPid=child.pid;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const watchers=[];
async function call(jar,path,method="GET",body){
  const headers=new Headers({accept:"application/json"});if(jar?.cookie)headers.set("cookie",jar.cookie+"; sites_outer=never_forward_this");
  if(method!=="GET")headers.set("origin",SITE);
  if(body!==undefined)headers.set("content-type",typeof body==="string"?"application/x-www-form-urlencoded":"application/json");
  const response=await worker.fetch(new Request(SITE+path,{method,headers,body:body===undefined?undefined:typeof body==="string"?body:JSON.stringify(body)}));
  const set=response.headers.get("set-cookie");if(set&&jar){jar.cookie=set.split(";",1)[0];jar.contract=set.replace(/soac_session=[A-Za-z0-9_-]*/,"soac_session=[redacted]");}
  return {response,data:response.headers.get("content-type")?.includes("application/json")?await response.json():await response.text()};
}
async function stream(jar){
 const controller=new AbortController(),headers=new Headers({cookie:jar.cookie});
 const response=await worker.fetch(new Request(SITE+"/api/stream?scene=planet&mode=weekday",{headers,signal:controller.signal}));
 assert.equal(response.status,200);assert.ok(response.headers.get("content-type").startsWith("text/event-stream"));
 const reader=response.body.getReader(),messages=[];const decoder=new TextDecoder();let carry="";
 const reading=(async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;carry+=decoder.decode(value,{stream:true});let i;while((i=carry.indexOf("\n\n"))!==-1){const packet=carry.slice(0,i);carry=carry.slice(i+2);for(const line of packet.split("\n"))if(line.startsWith("data: "))messages.push(JSON.parse(line.slice(6)));}}}catch(error){if(!controller.signal.aborted)throw error;}})();
 const watcher={messages,controller,reader,reading,async next(predicate){for(let n=0;n<100;n++){const m=messages.find(predicate);if(m)return m;await sleep(50);}throw new Error("SSE expected message absent: "+messages.map(m=>m.type).join(","));}};watchers.push(watcher);await watcher.next(m=>m.type==="snapshot");return watcher;
}
try{
  let ready=false;for(let n=0;n<60;n++){assert.ok(child.exitCode===null,"Owned backend must stay alive");try{const r=await nativeFetch(LOCAL+"/about");if(r.status===200){ready=true;break;}}catch{}await sleep(50);}check(ready,"Owned isolated Node backend starts on port 18954 with a new database");
  const ada={},bo={};
  for(const [jar,name,avatar]of[[ada,"Proxy Ada","cat"],[bo,"Proxy Bo","dog"]]){const joined=await call(jar,"/join","POST",new URLSearchParams({nickname:name,avatar,next:"/planet"}).toString());assert.equal(joined.response.status,200);assert.equal(joined.data.ok,true);assert.match(jar.cookie,/^soac_session=[A-Za-z0-9_-]+$/);assert.match(jar.contract,/HttpOnly; SameSite=Lax; Secure/);}
  check(ada.cookie!==bo.cookie,"The actual backend issues different identities through two independent application cookie jars");report.cookieContracts=[ada.contract,bo.contract];
  const a=await stream(ada),b=await stream(bo);let sa=await a.next(m=>m.type==="snapshot"),sb=await b.next(m=>m.type==="snapshot");
  assert.equal(sa.sessionId,sb.sessionId);assert.notEqual(sa.you.id,sb.you.id);assert.equal(sa.sounds.length,0);assert.equal(sb.sounds.length,0);check(true,"Two real proxied SSE streams expose the same fresh world and different authenticated participants");
  const sessionId=sa.sessionId;report.sessionId=sessionId;report.participantIds=[sa.you.id,sb.you.id];
  for(const[jar,x]of[[ada,0],[bo,1]]){const moved=await call(jar,`/api/sessions/${sessionId}/move`,"POST",{x,z:0,yaw:0});assert.equal(moved.response.status,200);assert.equal(moved.data.ok,true);}
  const first=await call(ada,`/api/sessions/${sessionId}/sounds`,"POST",{soundId:"trickle",operationId:"proxy-real-root"});assert.equal(first.response.status,201);assert.equal(first.data.ok,true);assert.equal(first.data.sound.byId,sa.you.id);assert.equal(first.data.chorus[0].duet,false);
  const root=first.data.sound;
  const replyRequest={soundId:"evening-forest",replyToId:root.id,operationId:"proxy-real-answer"};
  const reply=await call(bo,`/api/sessions/${sessionId}/sounds`,"POST",replyRequest);assert.equal(reply.response.status,201);assert.equal(reply.data.ok,true);assert.equal(reply.data.sound.byId,sb.you.id);assert.equal(reply.data.sound.replyToId,root.id);
  const expected=reply.data.chorus;assert.equal(expected.length,1);assert.equal(expected[0].id,root.id);assert.equal(expected[0].variant,"habitat");assert.equal(expected[0].duet,true);assert.equal(expected[0].placeId,"green");assert.equal(expected[0].liveSources.length,2);assert.deepEqual(expected[0].contributors.map(p=>p.id).sort(),[sa.you.id,sb.you.id].sort());
  for(const observer of[a,b]){const event=await observer.next(m=>m.type==="sound-left"&&m.sound.id===reply.data.sound.id);assert.deepEqual(event.chorus,expected);}
  check(true,"A real trickle→bird cross-author reply creates the identical two-person habitat result in both proxied SSE streams");
  const retried=await call(bo,`/api/sessions/${sessionId}/sounds`,"POST",replyRequest);assert.equal(retried.response.status,200);assert.equal(retried.data.replayed,true);assert.equal(retried.data.sound.id,reply.data.sound.id);check(true,"Retrying the actual operation through the Worker preserves its source identity");
  const a2=await stream(ada),b2=await stream(bo);sa=await a2.next(m=>m.type==="snapshot");sb=await b2.next(m=>m.type==="snapshot");assert.deepEqual(sa.chorus,expected);assert.deepEqual(sb.chorus,expected);assert.deepEqual(sa.sounds.map(s=>s.id).sort(),sb.sounds.map(s=>s.id).sort());assert.equal(sa.you.id,report.participantIds[0]);assert.equal(sb.you.id,report.participantIds[1]);
  check(true,"Reconnecting both authenticated cookie jars restores identical authoritative works and source IDs");report.work=expected[0];
  const db=new DatabaseSync(dbPath,{readOnly:true});report.database={users:db.prepare("SELECT COUNT(*) AS n FROM users").get().n,sounds:db.prepare("SELECT id,sound_id,placed_by,removed_at FROM placed_sounds ORDER BY id").all(),replies:db.prepare("SELECT sound_id,parent_id FROM sound_replies").all()};db.close();
  assert.equal(report.database.users,2);assert.equal(report.database.sounds.length,2);assert.equal(report.database.replies.length,1);check(true,"The isolated real SQLite database contains exactly two identities, two sources and one durable reply");
  for(const jar of[ada,bo]){const left=await call(jar,"/leave","POST","");assert.equal(left.response.status,303);assert.equal(left.response.headers.get("location"),SITE+"/explore");assert.equal(jar.cookie,"soac_session=");assert.match(jar.contract,/Max-Age=0/);}
  check(true,"Both actual leave responses clear the scoped identity cookie and translate their redirect to Sites");
  assert.deepEqual(report.blockedNetwork,[]);check(true,"Every Worker transport request stayed on the single fixed upstream origin mapped exclusively to localhost");report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 for(const w of watchers){w.controller.abort();try{await w.reader.cancel();}catch{}}await Promise.allSettled(watchers.map(w=>w.reading));
 globalThis.fetch=nativeFetch;
 if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),sleep(2000)]);if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await new Promise(r=>child.once("exit",r));}}
 report.backendStopped=child.exitCode!==null||child.signalCode!==null;report.backendExit={exitCode:child.exitCode,signalCode:child.signalCode};report.finishedAt=new Date().toISOString();
 writeFileSync(join(out,"results.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,backendStopped:report.backendStopped,out,failure:report.failure?.message??null}));
}
