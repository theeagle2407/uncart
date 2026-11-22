const $=id=>document.getElementById(id);
const text=(id,v)=>{$(id).textContent=v;};
const toggle=(id,on)=>{$(id).hidden=!on;};
const blank=(id)=>$(id).replaceChildren();
const node=(tag,str)=>{const el=document.createElement(tag);el.textContent=str;return el;};
let current=null,status=null,pending=false,control=null,clock=null,ticket=0;
function notice(message='',bad=false){text('notice',message);toggle('notice',!!message);$('notice').className=bad?'bad':'';}
function locked(on){
  pending=on;for(const id of ['next','edit','sample-desk','sample-bag','live','owned','reference','goal','link'])$(id).disabled=on;
  toggle('cancel',on&&!!control);$('live').textContent=on?'Checking…':'Check live';
}
async function api(path,data,signal){
  const r=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal}:{signal});
  let j;try{j=await r.json();}catch{throw Error('Uncart is not responding. Is its Terminal tab still running?');}
  if(!r.ok)throw Error(j.error||'Could not complete the check.');return j;
}
async function loadStatus(){try{status=await api('/api/status');text('runtime',status.installed&&status.hasKey?'Local · live enabled':'Local · examples available');}catch{notice('Could not reach the local server.',true);}}
function first(clear=false){
  notice();toggle('result',false);toggle('inputs',true);toggle('first',true);toggle('follow',false);
  if(clear){$('first').reset();$('second').reset();$('refdetails').open=false;current=null;}
  $('link').focus();
}
async function follow(){
  const j=await api('/api/question',{link:$('link').value.trim(),goal:$('goal').value.trim()});
  text('question',j.question);text('goal-summary',$('goal').value.trim());toggle('first',false);toggle('follow',true);$('owned').focus();
  if(status&&(!status.installed||!status.hasKey))notice('Worked examples are ready. For a live check, launch Uncart on your Mac with OpenClaw and your trial key.');
}
function items(id,arr){blank(id);for(const s of arr)$(id).append(node('li',s));toggle(id+'-block',arr.length>0);}
function show(j){
  current=j;notice();toggle('inputs',false);toggle('result',true);const {decision:d,receipt:r}=j;const live=r.mode==='live';
  text('mode',live?'Live OpenClaw check':'Worked example · not live');
  text('verdict',({try:'Try what you own',conditional:'Check a condition',unknown:'Not verified'})[d.verdict]);$('verdict').className='verdict '+({try:'',conditional:'maybe',unknown:'no'})[d.verdict];
  text('headline',d.title);text('reason',d.reason);items('steps',d.steps);items('needs',d.needs);
  blank('proof');for(const s of d.evidence){const box=node('div','');box.className='source';const a=node('a',s.title);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';box.append(a,node('p',s.quote),node('small',s.mode));$('proof').append(box);}
  toggle('proof-block',d.evidence.length>0);$('run').open=false;
  text('runinfo',live?[r.provider+' / '+r.model,r.session,'Model run: '+r.seconds+' s (elapsed time, not TPS).',j.product.read?'Product page read: '+j.product.title:'Product page could not be read. The link was not used as proof.'].join(' · '):'Hand-authored walkthrough using dated source notes. No model call or device test was performed.');
  toggle('facetime-block',live&&j.action?.id==='open-facetime');$('facetime').disabled=false;
  toggle('reuse',!live);toggle('tried',live&&d.verdict!=='unknown');$('tried').disabled=false;text('tried','I tried it');$('result').focus();
}
$('first').addEventListener('submit',async e=>{e.preventDefault();if(pending)return;notice();locked(true);try{await follow();}catch(error){notice(error.message,true);}finally{locked(false);if(!$('follow').hidden)$('owned').focus();}});
$('edit').onclick=()=>first();
$('again').onclick=()=>first(true);
$('reuse').onclick=async()=>{const x=current.input;first(true);$('link').value=x.link;$('goal').value=x.goal;$('owned').value=x.owned;try{await follow();notice('Example details are filled in. Edit them to match what you actually own.');}catch(e){notice(e.message,true);}};
$('tried').onclick=()=>{text('tried','Marked as tried');$('tried').disabled=true;notice('Marked on this screen only. No purchase or account was changed.');};
$('facetime').onclick=async()=>{if(!current?.action?.ticket)return;$('facetime').disabled=true;try{await api('/api/open-facetime',{ticket:current.action.ticket});notice('FaceTime opened. Select your iPhone in the Video menu, then open Desk View.');}catch(e){notice(e.message,true);}};
for(const id of ['desk','bag'])$('sample-'+id).onclick=async()=>{if(pending)return;try{locked(true);show(await api('/api/example/'+id));}catch(e){notice(e.message,true);}finally{locked(false);}};
$('second').addEventListener('submit',async e=>{
  e.preventDefault();if(pending)return;
  control=new AbortController();const seq=++ticket;locked(true);const start=Date.now();
  const progress=()=>notice('Reading sources and checking with OpenClaw… '+Math.floor((Date.now()-start)/1000)+' s');
  progress();clock=setInterval(progress,1000);
  try{const j=await api('/api/check',{link:$('link').value.trim(),goal:$('goal').value.trim(),owned:$('owned').value.trim(),reference:$('reference').value.trim()},control.signal);if(seq===ticket)show(j);}
  catch(err){if(seq===ticket)notice(err.name==='AbortError'?'Check cancelled. Your details are still here.':err.message,true);}
  finally{if(seq===ticket){clearInterval(clock);control=null;locked(false);}}
});
$('cancel').onclick=()=>control?.abort();
loadStatus();
