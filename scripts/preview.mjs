import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {parseArgs} from 'node:util';
import {createVaultSync} from './vault-sync.mjs';
import worker from '../dist/server/index.js';
import {portraitThumbnail} from './portrait-thumbnails.mjs';

export function serverConfig(env=process.env,args=[]){
 const {values}=parseArgs({args,options:{host:{type:'string'},port:{type:'string'},vault:{type:'string'},'public-url':{type:'string'}}});
 const port=Number(values.port??env.PORT??4173);
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT must be an integer between 0 and 65535.');
 const host=(values.host||env.HOST||(env.NODE_ENV==='production'||env.PORT?'0.0.0.0':'127.0.0.1')).replace(/^\[|\]$/g,'');
 if(!host||/[\s/\\?#@]/.test(host))throw Error('HOST must be a hostname or IP address.');
 let publicURL=values['public-url']||env.PUBLIC_URL;
 if(publicURL){publicURL=new URL(publicURL);if(!['http:','https:'].includes(publicURL.protocol)||publicURL.username||publicURL.password)throw Error('PUBLIC_URL must be an HTTP(S) URL without credentials.');publicURL=publicURL.origin;}
 const bundledVault=fileURLToPath(new URL('./vault/',import.meta.url));
 return {host,port,publicURL,vaultPath:resolve(values.vault||env.VAULT_PATH||(existsSync(bundledVault)?bundledVault:fileURLToPath(new URL('../../Obsidian Campaign/',import.meta.url)))),dataPath:resolve(env.DATA_PATH||fileURLToPath(new URL('../.preview-data/',import.meta.url)))};
}
const authority=(host,port)=>(isIP(host)===6?'['+host+']':host)+':'+port;
const sendJSON=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
export function createRequestHandler(config){
 const vault=createVaultSync(config.vaultPath);
 const bundledPortraits=fileURLToPath(new URL('./portraits/',import.meta.url));
 const portraits=existsSync(bundledPortraits)?bundledPortraits:resolve(config.dataPath,'portraits');
 const bucket={async get(key){try{const data=await readFile(resolve(config.dataPath,encodeURIComponent(key)));return {body:data,httpMetadata:{contentType:key.endsWith('.json')?'application/json':'application/octet-stream'}}}catch(error){if(error.code==='ENOENT')return null;throw error}},
  async put(key,data){await mkdir(config.dataPath,{recursive:true});await writeFile(resolve(config.dataPath,encodeURIComponent(key)),Buffer.from(data))}};
 return async(req,res)=>{
  try{
   const host=req.headers.host;
   if(!host||/[\s\\/#?@]/.test(host)){sendJSON(res,{error:'Invalid host'},400);return}
   let url;try{url=new URL('http://'+host+req.url)}catch{sendJSON(res,{error:'Invalid request URL'},400);return}
   const wildcard=['0.0.0.0','::'].includes(config.host);
   const port=req.socket?.localPort||config.port;
   const allowed=new Set([authority('localhost',port),authority('127.0.0.1',port),authority('::1',port),authority(config.host,port)]);
   if(config.publicURL)allowed.add(new URL(config.publicURL).host);
   if(!(allowed.has(host)||wildcard&&!config.publicURL)){sendJSON(res,{error:'Invalid host'},403);return}
   if(req.headers.origin&&req.headers.origin!==url.origin&&req.headers.origin!==config.publicURL){sendJSON(res,{error:'Invalid origin'},403);return}
   if(req.method==='GET'&&url.pathname==='/healthz'){sendJSON(res,{status:'ok',site:'Everwood'});return}
   if(req.method==='GET'&&url.pathname==='/api/local-vault'){
    const snapshot=await vault.snapshot();sendJSON(res,{revision:snapshot.revision,folder:'Obsidian Campaign'});return;
   }
   if(req.method==='GET'&&url.pathname==='/api/state'){
    const snapshot=await vault.snapshot();sendJSON(res,{maps:[],hosted:false,notes:snapshot.notes,zoomData:snapshot.zoomData,assets:snapshot.assets,localRevision:snapshot.revision});return;
   }
   if(req.method==='GET'&&url.pathname.startsWith('/local/file/')){
    const snapshot=await vault.snapshot({maxAgeMs:2000}),file=snapshot.files.get(decodeURIComponent(url.pathname.slice('/local/file/'.length)));
    if(!file){res.writeHead(404);res.end('Not found');return}
    let info;try{info=await stat(file.absolute)}catch(error){if(error.code==='ENOENT'){res.writeHead(404);res.end('Not found');return}throw error}
    let bytes,digest=file.digest;
    if(info.mtimeMs!==file.mtime||info.size!==file.size){bytes=await readFile(file.absolute);digest=createHash('sha256').update(bytes).digest('hex')}
    if(url.searchParams.get('thumbnail')==='portrait'&&file.type.startsWith('image/')){
     const etag='"'+digest+'-320-v1"',versioned=url.searchParams.get('v')===digest;
     const headers={'Content-Type':'image/webp','Cache-Control':versioned?'private,max-age=31536000,immutable':'private,no-cache',ETag:etag,'X-Content-Type-Options':'nosniff'};
     if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return}
     const thumbnail=await portraitThumbnail({...file,digest},portraits);
     res.writeHead(200,{...headers,'Content-Length':thumbnail.length});res.end(thumbnail);return;
    }
    const etag='"'+digest+'"',versioned=url.searchParams.get('v')===digest;
    const headers={'Content-Type':file.type,'Cache-Control':versioned?'private,max-age=31536000,immutable':'private,no-cache',ETag:etag,'X-Content-Type-Options':'nosniff'};
    if((req.headers['if-none-match']||'').split(',').map(v=>v.trim()).some(v=>v===etag||v==='*')){res.writeHead(304,headers);res.end();return}
    res.writeHead(200,{...headers,'Content-Length':info.size});res.end(bytes||await readFile(file.absolute));return;
   }
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024){sendJSON(res,{error:'Upload too large'},413);return}chunks.push(chunk)}
   // Use the verified request origin for the Worker adapter, including reverse proxies.
   const headers={...req.headers};if(headers.origin===config.publicURL)headers.origin=url.origin;
   const response=await worker.fetch(new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),{BUCKET:bucket});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error.message);sendJSON(res,{error:'Could not read the vault. Check VAULT_PATH and file access.'},503)}
 };
}
export const handleRequest=createRequestHandler(serverConfig());
export function listeningAddresses(address,interfaces=networkInterfaces()){
 const {address:host,port}=address,urls=[];
 if(['0.0.0.0','::'].includes(host)){
  urls.push('http://localhost:'+port);
  for(const entries of Object.values(interfaces))for(const entry of entries||[])if(!entry.internal&&(entry.family==='IPv4'||entry.family===4))urls.push('http://'+authority(entry.address,port));
 }else urls.push('http://'+authority(host,port));
 return [...new Set(urls)];
}
export async function startServer(config=serverConfig(process.env,process.argv.slice(2))){
 const server=http.createServer(createRequestHandler(config));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve)});
 const address=server.address();
 console.log('Everwood listening on '+authority(address.address,address.port));
 for(const url of listeningAddresses(address))console.log('Open: '+url);
 if(config.publicURL)console.log('Public: '+config.publicURL);
 console.log('Vault: '+config.vaultPath);
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const server=await startServer();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));server.closeIdleConnections?.()})}
 catch(error){console.error(error.code==='EADDRINUSE'?'The configured host/port is already in use. Change HOST/PORT or stop the previous server.':error.message);process.exitCode=1}
}
