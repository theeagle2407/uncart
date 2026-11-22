import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { dirname,join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createBridge } from './lib/agent.mjs';
import { input,topic,questions,examples,prompt,gather,validateDecision,workedExample } from './lib/check.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const assets=new Map([['/',['index.html','text/html']],['/style.css',['style.css','text/css']],['/app.js',['app.js','text/javascript']],['/mark.svg',['mark.svg','image/svg+xml']]]);
const maxBody=11000;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
const json=(res,status,obj)=>{if(res.destroyed)return;res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
async function body(req){let len=0;const chunks=[];for await(const b of req){len+=b.length;if(len>maxBody)throw Error('Request too long.');chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid JSON request.');}}
function launchFaceTime(){return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/open',['-a','FaceTime'],{shell:false,stdio:'ignore'});
  child.once('error',()=>reject(Error('Open FaceTime manually on your Mac.')));child.once('close',code=>code===0?resolve():reject(Error('Open FaceTime manually on your Mac.')));
});}
export function makeServer({bridge,fetchPage,preview=false,openFaceTime=process.platform==='darwin'?launchFaceTime:null}){
  let active=false,actionTicket=null;
  return http.createServer(async(req,res)=>{
    const host=req.headers.host||'';
    if(!preview&&!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host))return json(res,403,{error:'Open Uncart on the local address printed in Terminal.'});
    const path=req.url?.split('?')[0]??'/';
    try{
      if(req.method==='GET'&&assets.has(path)){const [name,type]=assets.get(path);const data=await readFile(join(root,'public',name));res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(data);return;}
      if(req.method==='GET'&&path==='/api/status')return json(res,200,{...bridge.status,examples:Object.entries(examples).map(([id,x])=>({id,name:x.name})),version:'0.1.0',preview});
      if(req.method==='GET'&&path.startsWith('/api/example/')){const id=path.slice(13);return Object.hasOwn(examples,id)?json(res,200,workedExample(id)):json(res,404,{error:'No such example.'});}
      if(req.method!=='POST'||!['/api/question','/api/check','/api/open-facetime'].includes(path))return json(res,404,{error:'Not found.'});
      // No browser should be able to trigger a paid run from a different site.
      const origin=req.headers.origin;
      if(!origin||!(origin==='http://'+host || (preview&&origin==='https://'+host)))return json(res,403,{error:'Open Uncart in the same local tab and retry.'});
      if(!(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'Use the Uncart form.'});
      if(path==='/api/open-facetime'){
        const v=await body(req);
        if(preview||!openFaceTime||!actionTicket||v?.ticket!==actionTicket.id||Date.now()>actionTicket.until)return json(res,403,{error:'No current FaceTime action. You can open the app manually.'});
        actionTicket=null;await openFaceTime();return json(res,200,{opened:true});
      }
      const x=input(await body(req),path==='/api/check');
      if(path==='/api/question')return json(res,200,{question:questions[topic(x)]});
      if(preview||!bridge.status.installed||!bridge.status.hasKey)return json(res,503,{error:'Live checks need OpenClaw and your trial key on your Mac. You can view a worked example without either.'});
      if(active)return json(res,429,{error:'A check is already running. Wait for it to finish.'});
      active=true;const controller=new AbortController();const cancel=()=>controller.abort();res.on('close',cancel);
      try{
        const ctx=await gather(x,fetchPage);
        if(controller.signal.aborted)return;
        const run=await bridge.ask(prompt(x,ctx),controller.signal);
        const decision=validateDecision(run.decision,x,ctx);let action=null;
        if(openFaceTime&&ctx.topic==='desk'&&/facetime/i.test(x.goal)&&decision.verdict!=='unknown'&&decision.evidence.some(e=>e.id==='desk')){
          actionTicket={id:randomUUID(),until:Date.now()+600000};action={id:'open-facetime',ticket:actionTicket.id};
        }else actionTicket=null;
        return json(res,200,{input:x,product:ctx.product,decision,receipt:run.receipt,action});
      }catch(e){return json(res,502,{error:e.message});}finally{active=false;res.off('close',cancel);}
    }catch(e){return json(res,400,{error:e.message});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const preview=process.argv.includes('--static-preview');
  const bridge=preview?{status:{installed:false,hasKey:false},async close(){}}:await createBridge();
  const srv=makeServer({bridge,preview});
  const portArg=process.argv.indexOf('--port');
  const rawPort=process.env.UNCART_PORT??(preview?(portArg>=0?process.argv[portArg+1]:process.env.PORT):undefined)??'4196';
  let port=Number(rawPort);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid Uncart port.');
  const bind=preview?'0.0.0.0':'127.0.0.1';
  const start=()=>srv.listen(port,bind);
  srv.on('error',async e=>{if(!preview&&e.code==='EADDRINUSE'&&port!==0){port=0;start();}else{console.error('Could not start Uncart: '+e.code);await bridge.close();process.exitCode=1;}});
  srv.on('listening',()=>{const url='http://127.0.0.1:'+srv.address().port;console.log('\nUncart is ready: '+url+'\nLeave this tab open. Stop with Control-C.\n');
    if(!preview&&process.platform==='darwin'&&process.argv.includes('--open'))spawn('open',[url],{stdio:'ignore'}).on('error',()=>{});
  });start();
  const stop=()=>{srv.close();srv.closeAllConnections();bridge.close().finally(()=>process.exit(0));};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
