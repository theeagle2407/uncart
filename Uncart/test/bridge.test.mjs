// Runs a CLI contract stand-in and a throwaway home; it cannot invoke a real account or make model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MODEL} from '../lib/check.mjs';
const exec=promisify(execFile);
const adapter=new URL('../lib/agent.mjs',import.meta.url).href;
const standin=[
  "const f=require('node:fs'),a=process.argv.slice(2),env=process.env;",
  "const text=f.readFileSync(env.OPENCLAW_CONFIG_PATH,'utf8'),c=JSON.parse(text);",
  "if(a[0]!=='--profile'||a[1]!=='cerebras-weekend'||text.includes('test-key-uncart')||c.tools.deny[0]!=='*'||process.cwd()!==f.realpathSync(c.agents.defaults.workspace))process.exit(10);",
  "if(a[2]==='config'){if(a.slice(2).join(' ')!=='config get tools.deny --json')process.exit(11);console.log(JSON.stringify(c.tools.deny));}",
  "else if(a[2]==='agent'){if(!a.includes('--local')||a.includes('--deliver')||a[a.indexOf('--message')+1]!=='fixture purchase check'||!a.includes('--json'))process.exit(12);",
  "console.log(JSON.stringify({result:{payloads:[{text:JSON.stringify({verdict:'unknown'})}],meta:{agentMeta:{provider:'cerebras',model:"+JSON.stringify(MODEL)+"}}}}));}",
  "else process.exit(13);"
].join('\n');
test('CLI bridge checks isolated configuration and parses an agent envelope (stand-in CLI)',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'uncart-test-cli-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  await writeFile(join(temp,'openclaw'),'#!'+process.execPath+'\n'+standin,{mode:0o700});
  const js='import {createBridge} from '+JSON.stringify(adapter)+'; const bridge=await createBridge(); try {if(!bridge.status.installed)throw Error("stand-in missing"); console.log(JSON.stringify(await bridge.ask("fixture purchase check")));}finally{await bridge.close();}';
  const child=await exec(process.execPath,['--input-type=module','-e',js],{env:{HOME:temp,PATH:temp,TMPDIR:temp,CEREBRAS_API_KEY:'test-key-uncart'},timeout:10000});
  const x=JSON.parse(child.stdout);assert.equal(x.receipt.model,MODEL);assert.match(x.receipt.session,/^uncart-/);assert.equal(x.decision.verdict,'unknown');assert.ok(!child.stdout.includes('test-key-uncart'));
});
test('absence of local CLI and key disables live checks without a network call',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'uncart-test-off-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  const js='import {createBridge} from '+JSON.stringify(adapter)+'; const b=await createBridge(); console.log(JSON.stringify(b.status));await b.close();';
  const child=await exec(process.execPath,['--input-type=module','-e',js],{env:{HOME:temp,PATH:temp},timeout:5000});
  assert.deepEqual(JSON.parse(child.stdout),{installed:false,hasKey:false});
});
