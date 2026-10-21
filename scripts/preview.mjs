import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createVaultSync} from './vault-sync.mjs';
import worker from '../dist/server/index.js';
const dataDirectory = fileURLToPath(new URL('../.preview-data/', import.meta.url));
const vault = createVaultSync(fileURLToPath(new URL('../../Obsidian Campaign/', import.meta.url)));
await mkdir(dataDirectory,{recursive:true});
const env={BUCKET:{async get(key){try{const data=await readFile(dataDirectory+encodeURIComponent(key));return{body:data,httpMetadata:{contentType:key.endsWith('.json')?'application/json':'image/png'}}}catch(e){if(e.code==='ENOENT')return null;throw e}},async put(key,data){await writeFile(dataDirectory+encodeURIComponent(key),Buffer.from(data))}}};
const origin = 'http://localhost:4173';
const sendJSON = (res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
export async function handleRequest(req,res){
 try {
  if(!['localhost:4173','127.0.0.1:4173'].includes(req.headers.host)||(req.headers.origin&&![origin,'http://127.0.0.1:4173'].includes(req.headers.origin))){sendJSON(res,{error:'Invalid origin'},403);return;}
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/api/local-vault'){
   const snapshot=await vault.snapshot();sendJSON(res,{revision:snapshot.revision,folder:'Obsidian Campaign'});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/state'){
   const snapshot=await vault.snapshot(),saved=await env.BUCKET.get('vault/state.json');
   const state=saved?JSON.parse(saved.body.toString()):{maps:[],assets:[]};
   sendJSON(res,{...state,notes:snapshot.notes,leafletData:snapshot.leafletData,assets:[...(state.assets||[]).filter(a=>!a.url.startsWith('/local/file/')&&!snapshot.assets.some(local=>local.path===a.path)),...snapshot.assets],localRevision:snapshot.revision});return;
  }
  if(req.method==='GET'&&url.pathname.startsWith('/local/file/')){
   const snapshot=await vault.snapshot(),file=snapshot.files.get(decodeURIComponent(url.pathname.slice('/local/file/'.length)));
   if(!file){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(file.absolute));return;
  }
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024){sendJSON(res,{error:'Upload too large'},413);return;}chunks.push(chunk)}
  const response=await worker.fetch(new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);sendJSON(res,{error:'Could not read the local vault. Check that Obsidian Campaign is available.'},503)}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const server=http.createServer(handleRequest);
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 4173 is already in use. Close the previous Atlas server first.':error.message);process.exitCode=1});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173\nLive sync: Obsidian Campaign (checks every 2 seconds).'));

}
