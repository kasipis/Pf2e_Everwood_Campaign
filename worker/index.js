const HTML = /*__HTML__*/ "";
const VENDORS = /*__VENDORS__*/ {};
const BUNDLED_STATE = /*__BUNDLED_STATE__*/ null;
const BUNDLED_FILES = /*__BUNDLED_FILES__*/ {};
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {
 async fetch(request,env) {
  const url=new URL(request.url), path=url.pathname;
  try {
   if(path.startsWith('/vendor/')) { const v=VENDORS[path]; return v ? new Response(v.body,{headers:{'Content-Type':v.type,'Cache-Control':'public,max-age=86400'}}) : new Response('Not found',{status:404}); }
   if(path.startsWith('/api/')) {
    if(request.method==='GET' && path.startsWith('/api/file/')) {
     const file=BUNDLED_FILES[path.slice(10)];
     if(file){const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':file.type,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}})}
    }
    // All vault data is protected by the owner-private Sites access boundary.
    if(!env.BUCKET) return json({error:'Vault storage is unavailable.'},503);
    if(request.method!=='GET' && request.headers.get('Origin')!==url.origin) return json({error:'Invalid origin'},403);
    const key=path==='/api/state'?'vault/state.json':path.startsWith('/api/file/')?'vault/files/'+path.slice(10):null;
    if(!key) return json({error:'Not found'},404);
    if(request.method==='GET') { const o=await env.BUCKET.get(key); if(path==='/api/state'&&BUNDLED_STATE){const saved=o?await new Response(o.body).json():null;return json({...BUNDLED_STATE,...(saved?{maps:saved.maps}:{}),localRevision:undefined})} if(!o) return path==='/api/state'?json(null):new Response('Not found',{status:404}); return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
    if(request.method==='PUT') {
     const limit=path==='/api/state'?5*1024*1024:20*1024*1024;
     if(Number(request.headers.get('Content-Length'))>limit) return json({error:'File is too large (20 MB maximum).'},413);
     const bytes=await request.arrayBuffer(); if(bytes.byteLength>limit) return json({error:'Upload too large'},413);
     if(path==='/api/state') { let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{return json({error:'Invalid JSON'},400)} if(!Array.isArray(data.notes)||!Array.isArray(data.maps)) return json({error:'Invalid vault'},400); }
     const contentType=path==='/api/state'?'application/json':request.headers.get('Content-Type')||'application/octet-stream';
     await env.BUCKET.put(key,bytes,{httpMetadata:{contentType}}); return json({ok:true});
    }
    return json({error:'Method not allowed'},405);
   }
   if(path==='/' || path==='/index.html') return new Response(HTML,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
   return new Response('Not found',{status:404});
  }catch(e){return json({error:'Could not access vault storage. Please try again.'},500)}
 }
};
