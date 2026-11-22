import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {makeServer} from '../server.mjs';
import {examples,workedExample,MODEL} from '../lib/check.mjs';
const fixture={status:{installed:true,hasKey:true},async ask(){
  const decision=workedExample('desk').decision;return {decision,receipt:{mode:'test-only',provider:'fixture',model:MODEL,session:'test',seconds:0}};
}};
const noPages=async()=>{throw Error('offline in tests');};
async function start(t,bridge=fixture,preview=false,openFaceTime=null){
  const srv=makeServer({bridge,fetchPage:noPages,preview,openFaceTime});
  srv.listen(0,'127.0.0.1');await once(srv,'listening');
  t.after(()=>new Promise(resolve=>{srv.close(resolve);srv.closeAllConnections();}));
  const base='http://127.0.0.1:'+srv.address().port;
  const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  return {base,post};
}
test('serves the screen, its assets, status and a clearly labelled example',async t=>{
  const {base}=await start(t);
  const h=await fetch(base);assert.match(await h.text(),/Before you/);assert.match(h.headers.get('content-security-policy'),/script-src 'self'/);
  for(const p of ['/app.js','/mark.svg','/style.css'])assert.equal((await fetch(base+p)).status,200);
  const s=await (await fetch(base+'/api/status')).json();assert.equal(s.hasKey,true);assert.deepEqual(Object.keys(s).sort(),['installed','hasKey','examples','version','preview'].sort());
  assert.equal((await (await fetch(base+'/api/example/bag')).json()).receipt.mode,'worked-example');
  assert.equal((await fetch(base+'/api/example/missing')).status,404);
});
test('one ownership question before a live request and no built-in model response',async t=>{
  let asked=0;
  const {post}=await start(t,{...fixture,async ask(p){asked++;assert.match(p,/Show my face/);return fixture.ask();}});
  const q=await post('/api/question',{link:examples.desk.link,goal:examples.desk.goal});assert.equal(q.status,200);assert.match((await q.json()).question,/phone/);assert.equal(asked,0);
  const r=await post('/api/check',examples.desk);assert.equal(r.status,200);const j=await r.json();
  assert.equal(asked,1);assert.equal(j.receipt.mode,'test-only');assert.equal(j.decision.evidence.length,2);assert.equal(j.product.read,false);
});
test('a no-key run never substitutes a worked example',async t=>{
  const {post}=await start(t,{status:{installed:true,hasKey:false},ask(){assert.fail('model must not run');}});
  const r=await post('/api/check',examples.bag);assert.equal(r.status,503);const j=await r.json();assert.match(j.error,/trial key/);assert.equal(j.receipt,undefined);
});
test('preview cannot use a configured model and unexpected origins cannot request a check',async t=>{
  const {post}=await start(t,fixture,true);
  assert.equal((await post('/api/check',examples.bag)).status,503);
  assert.equal((await post('/api/question',examples.bag,{Origin:'https://example.org'})).status,403);
  assert.equal((await post('/api/question',examples.bag,{'Content-Type':'text/plain'})).status,415);
});
test('two clicks cannot start overlapping model calls, and an error allows a subsequent retry',async t=>{
  const {promise:entered,resolve:enter}=Promise.withResolvers(),{promise:gate,resolve:release}=Promise.withResolvers();let n=0;
  const {post}=await start(t,{...fixture,async ask(){n++;if(n===1){enter();await gate;throw Error('Cerebras is busy.');}return fixture.ask();}});
  const first=post('/api/check',examples.desk);await entered;
  let second;try{second=await post('/api/check',examples.desk);}finally{release();}
  assert.equal(second.status,429);assert.equal((await first).status,502);
  assert.equal((await post('/api/check',examples.desk)).status,200);assert.equal(n,2);
});
test('FaceTime is an explicit, one-use, local action; a purchase check alone never opens it',async t=>{
  let opens=0;const {post}=await start(t,fixture,false,async()=>{opens++;});
  assert.equal((await post('/api/open-facetime',{ticket:'unused'})).status,403);
  const r=await post('/api/check',examples.desk);const {action}=await r.json();assert.equal(action.id,'open-facetime');assert.equal(opens,0);
  assert.equal((await post('/api/open-facetime',{ticket:action.ticket})).status,200);assert.equal(opens,1);
  assert.equal((await post('/api/open-facetime',{ticket:action.ticket})).status,403);assert.equal(opens,1);
});
