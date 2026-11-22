import test from 'node:test';
import assert from 'node:assert/strict';
import {publicURL,routable,parsePage,excerpts} from '../lib/web.mjs';
import {examples,input,topic,questions,fit,gather,prompt,workedExample,validateDecision,sources,MODEL} from '../lib/check.mjs';
import {unpack} from '../lib/agent.mjs';

const offline=async()=>{throw Error('unavailable');};
const clone=x=>structuredClone(x);
const proposal=(id)=>{const {decision}=workedExample(id);return {...decision,evidence:decision.evidence.map(({id,quote})=>({id,quote}))};};
const env=(provider='cerebras',model=MODEL,body='{}')=>({result:{meta:{agentMeta:{provider,model}},payloads:[{text:body}]}});
test('worked examples never masquerade as a live model result',()=>{
  for(const id of Object.keys(examples)){const s=workedExample(id);assert.equal(s.receipt.mode,'worked-example');assert.equal(s.receipt.model,null);assert.equal(s.decision.verdict,'try');assert.equal(s.decision.evidence.length,2);assert.ok(s.decision.evidence.every(e=>e.mode.startsWith('Saved source note')));}
});
test('guides ask about the relevant item, or ask a general ownership question',()=>{
  assert.equal(topic(examples.desk),'desk');assert.equal(topic(examples.bag),'bag');
  const x=input({link:'https://example.com/keyboard',goal:'Use the number keys'},false);assert.equal(topic(x),'other');assert.match(questions.other,/already own/);
  assert.throws(()=>input({link:x.link,goal:x.goal}),/what you have/);
});
test('only public HTTPS input is accepted; trackers/fragments are stripped',()=>{
  assert.equal(publicURL('https://example.com/product?color=red&utm_campaign=sale#top').href,'https://example.com/product?color=red');
  for(const u of ['http://example.com','https://localhost/test','https://127.0.0.1/a','https://example.com/private?token=example','https://user@example.com/'])assert.throws(()=>publicURL(u));
  assert.equal(routable('127.0.0.1'),false);assert.equal(routable('192.168.1.1'),false);assert.equal(routable('10.0.0.1'),false);assert.equal(routable('1.1.1.1'),true);
});
test('extracts source text without navigation, scripts, or markup',()=>{
  const d=parsePage('<title>Desk &amp; phone</title><script>do not put this script in a receipt</script><nav>unrelated navigation text</nav><main><p>Share the desk and notebook using the camera.</p></main>');
  assert.equal(d.title,'Desk & phone');assert.deepEqual(excerpts(d.lines,'desk notebook camera',1),['Share the desk and notebook using the camera.']);assert.ok(!d.lines.join(' ').includes('script in'));
});
test('distinguishes live evidence from a dated reviewed note',async()=>{
  const x=input(examples.bag), pageText='Every fare includes one small personal bag for the space under the seat.';
  const c=await gather(x,async url=>({title:'Test page',lines:[pageText],url}));
  const plan=proposal('bag');plan.evidence=[{id:'airline',quote:'one small personal bag'}];
  assert.equal(validateDecision(plan,x,c).evidence[0].mode,'Page read this run');
  assert.match(validateDecision(proposal('bag'),x,c).evidence[0].mode,/Saved/);
  const off=await gather(x,offline);assert.equal(off.product.read,false);assert.match(prompt(x,off),/untrusted evidence/);
});
test('fabricated citations and missing evidence cannot authorize a recommendation',async()=>{
  const x=input(examples.desk),c=await gather(x,offline), d=proposal('desk');
  for(const evidence of [[],[{id:'invented',quote:'wrong document'}],[{id:'desk',quote:'there is free hardware here'}]])assert.equal(validateDecision({...d,evidence},x,c).verdict,'unknown');
  assert.throws(()=>validateDecision({...d,steps:['Visit https://example.com']},x,c),/unverified link/);
});
test('phone-only, incompatible or incompletely described camera setups do not get a go-ahead',async()=>{
  const c=await gather(examples.desk,offline),d=proposal('desk');
  assert.equal(validateDecision(d,{...examples.desk,owned:'An iPhone 16 Pro Max only'},c).verdict,'unknown');
  assert.equal(validateDecision(d,{...examples.desk,owned:'MacBook Pro M3 and an iPhone 16e'},c).verdict,'unknown');
  assert.equal(validateDecision(d,{...examples.desk,owned:'MacBook Pro M3, iPhone 16 Pro Max'},c).verdict,'conditional');
  assert.equal(validateDecision(d,{...examples.desk,owned:'not sure'},c).verdict,'unknown');
});
test('bag measurements compare three sides regardless of order and understand inches',()=>{
  assert.equal(fit('20 x 40 x 30 cm').fits,true);assert.equal(fit('20 × 30.01 × 40 cm').fits,false);
  assert.equal(fit('7 x 10 x 14 inches').fits,true);assert.equal(fit('10 x 20 x 30'),null);assert.equal(fit('0 x 1 x 2 cm'),null);
});
test('larger, unmeasured and second bags cannot inherit the 28L verdict',async()=>{
  const x=input(examples.bag),d=proposal('bag');d.evidence=d.evidence.filter(e=>e.id==='airline');
  for(const [owned,verdict,title] of [
    ['One Classic 36L: 45 × 31 × 20 cm packed.','conditional',/over the included limit/],
    ['I only know that mine is the Classic backpack.','conditional',/Measure/],
    ['Two bags. Each measures 39 × 29 × 19 cm.','unknown',/enough evidence/]
  ]){const y={...x,owned};const dec=validateDecision(d,y,await gather(y,offline));assert.equal(dec.verdict,verdict);assert.match(dec.title,title);}
});
test('a different airline is not justified by the example airline or bag dimensions',async()=>{
  const x=input({...examples.bag,goal:'I fly on easyJet. Can I skip buying more luggage?'}),ctx=await gather(x,offline);
  assert.ok(!ctx.records.some(r=>r.id==='airline'));assert.equal(validateDecision(proposal('bag'),x,ctx).verdict,'unknown');
});
test('arbitrary product cannot become a verified alternative from the product listing alone',async()=>{
  const x=input({link:'https://example.com/remote',goal:'Advance slides',owned:'A presentation keyboard'});
  const d={verdict:'try',title:'Try the remote key.',reason:'The manual lists a supported mode.',steps:['Advance a slide.'],needs:[],evidence:[]};
  const ctx=await gather(x,offline);assert.equal(validateDecision(d,x,ctx).verdict,'unknown');
  const y={...x,reference:'https://example.org/manual'};
  const c=await gather(y,async url=>({url,title:'Keyboard manual',lines:['Use presentation mode to advance slides.']}));
  assert.equal(validateDecision({...d,evidence:[{id:'reference',quote:'presentation mode to advance slides'}]},y,c).verdict,'conditional');
});
test('the CLI must return the expected provider and model; no substitution or silent replay',()=>{
  assert.equal(unpack('banner\n'+JSON.stringify(env('cerebras',MODEL,'{"verdict":"unknown"}'))).model,MODEL);
  assert.throws(()=>unpack(JSON.stringify(env('elsewhere',MODEL))),/required Cerebras/);
  assert.throws(()=>unpack(JSON.stringify(env('cerebras','different'))),/required Cerebras/);
  const e=clone(env());e.result.payloads=[{isError:true,text:'queue_exceeded (429)'}];assert.throws(()=>unpack(JSON.stringify(e)),/busy/);
  assert.throws(()=>unpack(JSON.stringify(env('cerebras',MODEL,'not json'))),/decision format/);
  assert.match(sources.camera.url,/^https:\/\/support\.apple\.com\//);
});
