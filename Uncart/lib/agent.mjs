import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,mkdir,access,rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter,join } from 'node:path';
import { MODEL,modelProfile } from './check.mjs';

export async function available(exe='openclaw'){
  const choices=(process.env.PATH??'').split(delimiter).filter(Boolean).map(p=>join(p,exe));
  for(const p of choices){try{await access(p,constants.X_OK);return p;}catch{/* check next executable */}}
  return null;
}
function issue(raw){
  const t=String(raw);
  if(/429|queue_exceeded|rate.limit|too many requests/i.test(t))return 'Cerebras is busy. Wait a minute, then retry once. Your inputs are still here.';
  if(/401|403|sign in|unauth|api key|api_key/i.test(t))return 'Cerebras authentication failed. Relaunch from the Terminal tab with your trial key; do not paste it into the browser.';
  if(/404|model.*not found|unknown model/i.test(t))return 'The trial model is unavailable. Check access for your Cerebras organization.';
  if(/lock|exclusive ownership/i.test(t))return 'Your OpenClaw profile is busy. Let its other local run finish, then retry.';
  if(/plugin|provider.*not found/i.test(t))return 'OpenClaw could not load the Cerebras provider. Check the cerebras-weekend profile in Terminal.';
  if(/time.?out|aborted/i.test(t))return 'The model did not finish in time. Retry once when the queue settles.';
  return 'OpenClaw did not complete this check. Confirm the cerebras-weekend profile can run the trial model in Terminal.';
}
function runCommand(exe,args,{env,cwd,signal,limit=135000}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(Error('Check cancelled.'));
    const child=spawn(exe,args,{env,cwd,shell:false,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
    let out='',err='',done=false,force,failMessage='';
    function stop(message){
      if(done||failMessage)return;
      failMessage=message;
      function kill(sig){try{if(child.pid && process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{/* already exited */}}
      kill('SIGTERM');force=setTimeout(()=>kill('SIGKILL'),900);force.unref?.();
    }
    const cancel=()=>stop('Check cancelled.'),timer=setTimeout(()=>stop('The model timed out. Your inputs are still here.'),limit);
    signal?.addEventListener('abort',cancel,{once:true});
    const finish=fn=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(force);signal?.removeEventListener('abort',cancel);fn();};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',s=>{if(out.length<512000)out+=s;if(out.length>512000)stop('Model output exceeded the limit.');});
    child.stderr.on('data',s=>{err=(err+s).slice(-18000);});
    child.once('error',()=>finish(()=>reject(Error('OpenClaw could not start. Relaunch with Node 26 and OpenClaw on PATH.'))));
    child.once('close',code=>finish(()=>{if(failMessage)return reject(Error(failMessage));if(code!==0)return reject(Error(issue(out+' '+err)));resolve(out);}));
  });
}
function jsonOut(raw) {
  const s=raw.trim();
  try{return JSON.parse(s);}catch{
    // Some releases print a banner before the final pretty-printed JSON envelope.
    for(const m of s.matchAll(/^(?=[{\[])/gm)){try{return JSON.parse(s.slice(m.index));}catch{/* continue */}}
    throw Error('OpenClaw returned no readable JSON receipt.');
  }
}
export function unpack(raw){
  const j=jsonOut(raw),r=j?.result??j,m=r?.meta?.agentMeta;
  if(j?.ok===false||j?.error||r?.error||r?.meta?.aborted||r?.payloads?.some?.(v=>v.isError))throw Error(issue(JSON.stringify(j).slice(0,2500)));
  if(m?.provider!=='cerebras'||m?.model!==MODEL)throw Error('This run did not return the required Cerebras/Kimi model receipt. No live result was accepted.');
  const payload=(r.payloads??[]).map(p=>typeof p.text==='string'?p.text:'').join('\n').trim();
  let d;try{d=JSON.parse(payload.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,''));}catch{throw Error('Kimi returned text instead of the decision format. Retry the check.');}
  if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Kimi returned an invalid decision.');
  return {decision:d,provider:m.provider,model:m.model};
}
export async function createBridge(){
  const exe=await available(),hasKey=Boolean(process.env.CEREBRAS_API_KEY?.trim());
  if(!exe||!hasKey)return {status:{installed:!!exe,hasKey},async ask(){throw Error(!exe?'OpenClaw is not on PATH. Use the Mac launcher in the Terminal tab with Node 26.':'No Cerebras key is set. Restart the Mac launcher and enter the key at its hidden Terminal prompt.');},async close(){}};
  const root=await mkdtemp(join(tmpdir(),'uncart-')),workspace=join(root,'workspace'),config=join(root,'config.json');
  await mkdir(workspace,{mode:0o700});
  // Ephemeral, non-secret config. Keep the installed plugin root under the existing profile;
  // don't rewrite its defaults, read its credentials, or inject its Trace workspace.
  await writeFile(config,JSON.stringify({plugins:{allow:['cerebras']},
    models:{providers:{cerebras:{baseUrl:'https://api.cerebras.ai/v1',api:'openai-completions',apiKey:'${CEREBRAS_API_KEY}',models:[{id:MODEL,name:'Kimi K3.1 Pro trial',reasoning:true,input:['text']}]}}},
    agents:{defaults:{model:{primary:'cerebras/'+MODEL},workspace,skipBootstrap:true}},
    tools:{deny:['*'],fs:{workspaceOnly:true}}
  }),{mode:0o600,flag:'wx'});
  const env={};for(const k of ['PATH','HOME','USER','LOGNAME','TMPDIR','LANG','LC_ALL','CEREBRAS_API_KEY','SystemRoot'])if(process.env[k])env[k]=process.env[k];
  Object.assign(env,{OPENCLAW_CONFIG_PATH:config,NO_COLOR:'1'});
  let verified=false;
  return {status:{installed:true,hasKey:true},async ask(message,signal){
    if(!verified){
      const policy=jsonOut(await runCommand(exe,['--profile',modelProfile,'config','get','tools.deny','--json'],{env,cwd:workspace,signal,limit:30000}));
      if(!Array.isArray(policy)||!policy.includes('*'))throw Error('The restricted run configuration was not loaded. No product data was sent.');
      verified=true;
    }
    const id='uncart-'+randomUUID(),started=performance.now();
    const raw=await runCommand(exe,['--profile',modelProfile,'agent','--local','--agent','main','--session-id',id,'--timeout','115','--message',message,'--json'],{env,cwd:workspace,signal});
    const ans=unpack(raw);
    return {decision:ans.decision,receipt:{mode:'live',provider:ans.provider,model:ans.model,session:id,seconds:Math.round((performance.now()-started)/100)/10}};
  },async close(){await rm(root,{recursive:true,force:true});}};
}
