import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function publicURL(value) {
  let u;
  try { u = new URL(value); } catch { throw Error('Paste a complete public https:// link.'); }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || isIP(host) ||
      host.includes(':') || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|home|lan|arpa)$/.test(host))
    throw Error('Use a public HTTPS page, not a private address or a sign-in link.');
  for (const key of [...u.searchParams.keys()]) {
    if (/token|signature|credential|password|secret|api.?key|^auth$|^code$|^x-amz/i.test(key)) throw Error('This looks like a private or signed URL. Use the public product page.');
    if (/^utm_|^(gclid|fbclid|ref_)$/i.test(key)) u.searchParams.delete(key);
  }
  u.hostname = host; u.hash = '';
  return u;
}

export function routable(ip) {
  if (isIP(ip) !== 4) return false;
  const [a,b,c] = ip.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
    (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 ||
    b===0 || (b===88 && c===99))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) ||
    (a===203 && b===0 && c===113));
}

const decode = s => s.replace(/&(#x[\da-f]+|#\d+|amp|nbsp|quot|apos|lt|gt|times|rsquo|lsquo|ndash|mdash);/gi, (m,k) => {
  if (k[0] !== '#') return ({amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>',times:'×',rsquo:"'",lsquo:"'",ndash:'–',mdash:'—'})[k.toLowerCase()] ?? ' ';
  const n = k[1].toLowerCase()==='x' ? parseInt(k.slice(2),16) : Number(k.slice(1));
  return n>0 && n<=0x10ffff ? String.fromCodePoint(n) : ' ';
});
export const clean = v => decode(String(v)).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
export function parsePage(html) {
  const body = html.replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style|svg|nav|footer|header|noscript)\b[^>]*>[^]*?<\/\1\s*>/gi,' ');
  const title = clean((html.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]*>/g,' ')).slice(0,160);
  const lines = body.replace(/<(?:\/?(?:p|li|dt|dd|h[1-6]|tr|section|article|div|main)|br)\b[^>]*>/gi,'\n')
    .replace(/<[^>]*>/g,' ').split('\n').map(clean).filter(l=>l.length>=10);
  return {title, lines: [...new Set(lines)].slice(0,2500)};
}
export function excerpts(lines, keywords, count=5) {
  const terms = [...new Set(keywords.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(x=>!['the','and','what','have','want','this','that','with','need','will','your','for'].includes(x));
  return lines.map((s,i)=>({s,i,score:terms.reduce((v,t)=>v+Number(s.toLowerCase().includes(t)),0)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,count).map(x=>x.s.slice(0,430));
}

// Public read-only HTML. Resolve and pin a public IPv4 on EVERY hop; never send cookies,
// a referrer, proxy headers, or user credentials. TLS still checks the original hostname.
export async function readPage(raw, opts={}) {
  const signal=opts.signal ?? AbortSignal.timeout(6500);
  async function hop(value, left) {
    const u=publicURL(value);
    if(signal.aborted) throw Error('Read timed out.');
    const addrs = await Promise.race([lookup(u.hostname,{all:true,family:4}),new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>reject(Error('Read timed out.')),{once:true});
    })]);
    if(!addrs.length || !addrs.every(a=>routable(a.address))) throw Error('Not a public page.');
    const pinned=addrs[0].address;
    const res = await new Promise((resolve,reject)=>{
      const req=https.get(u,{agent:false,family:4,signal,
        lookup:(_h,o,cb)=>o?.all?cb(null,[{address:pinned,family:4}]):cb(null,pinned,4),
        headers:{'user-agent':'Uncart/0.1 (read-only product check)','accept':'text/html, text/plain;q=0.8','accept-encoding':'identity'}},resolve);
      req.on('error',reject);
    });
    if([301,302,303,307,308].includes(res.statusCode)){
      const next=res.headers.location;res.destroy();
      if(left<1||!next)throw Error('Too many redirects.');
      return hop(new URL(next,u).href,left-1);
    }
    if(res.statusCode!==200||!/^text\/(html|plain)\b/i.test(res.headers['content-type']??'') ||
      (res.headers['content-encoding'] && res.headers['content-encoding']!=='identity')){
      res.destroy();throw Error('Page unavailable for a public text read.');
    }
    const chunks=[];let size=0;
    for await(const a of res){const part=a.subarray(0,1024*1024-size);chunks.push(part);size+=part.length;if(size>=1024*1024)break;}
    const doc=parsePage(Buffer.concat(chunks).toString('utf8'));
    if(!doc.title&&!doc.lines.length)throw Error('No readable page text.');
    return {...doc,url:u.href};
  }
  return hop(raw,3);
}
