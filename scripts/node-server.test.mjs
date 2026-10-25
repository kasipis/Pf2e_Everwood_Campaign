import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {serverConfig,createRequestHandler,listeningAddresses} from './preview.mjs';
async function request(handler,path,headers={},localPort){
 const req=Readable.from([]);Object.assign(req,{method:'GET',url:path,headers:{host:'localhost:4173',...headers},socket:localPort?{localPort}:undefined});
 let status,body,responseHeaders,bytes;const res={writeHead(code,headers){status=code;responseHeaders=headers},end(data){bytes=data;body=String(data)}};await handler(req,res);return {status,body,bytes,headers:responseHeaders};
}
test('Node configuration supports hosting-provider PORT, explicit hosts and command-line options',()=>{
 assert.equal(serverConfig({}).host,'127.0.0.1');assert.equal(serverConfig({PORT:'8080'}).host,'0.0.0.0');
 assert.equal(serverConfig({NODE_ENV:'production'}).host,'0.0.0.0');
 const config=serverConfig({PORT:'8080'},['--host','192.168.1.20','--port','3000','--vault','../Obsidian Campaign']);assert.equal(config.port,3000);assert.equal(config.host,'192.168.1.20');
 assert.throws(()=>serverConfig({PORT:'invalid'}),/PORT/);assert.throws(()=>serverConfig({PORT:'70000'}),/PORT/);
 assert.equal(serverConfig({HOST:'::'}).host,'::');
});
test('custom deployed hosts serve requests and foreign origins are rejected',async()=>{
 const handler=createRequestHandler(serverConfig({HOST:'0.0.0.0',PORT:'8080',PUBLIC_URL:'https://maps.example'}));
 assert.equal((await request(handler,'/healthz',{host:'maps.example',origin:'https://maps.example'})).status,200);
 assert.equal((await request(handler,'/healthz',{host:'maps.example',origin:'https://foreign.example'})).status,403);
 assert.equal((await request(handler,'/healthz',{host:'foreign.example'})).status,403);
 assert.equal((await request(handler,'/healthz',{host:'bad@host'})).status,400);
 const ephemeral=createRequestHandler(serverConfig({HOST:'127.0.0.1',PORT:'0'}));
 assert.equal((await request(ephemeral,'/healthz',{host:'localhost:43210'},43210)).status,200);
});
test('startup URLs include the actual bound port and network addresses',()=>{
 const urls=listeningAddresses({address:'0.0.0.0',port:3000},{lan:[{family:'IPv4',internal:false,address:'192.168.1.20'}],loopback:[{family:'IPv4',internal:true,address:'127.0.0.1'}]});
 assert.deepEqual(urls,['http://localhost:3000','http://192.168.1.20:3000']);
 assert.deepEqual(listeningAddresses({address:'::1',port:1234},{}),['http://[::1]:1234']);
});
test('portable dist server loads its bundled vault and serves the built site',async()=>{
 const portable=await import('../dist/server.mjs');const config=portable.serverConfig({});assert.match(config.vaultPath,/[\\/]dist[\\/]vault$/);
 const handler=portable.createRequestHandler(config);const response=await request(handler,'/api/state');assert.equal(response.status,200);const state=JSON.parse(response.body);assert(state.notes.length>0);assert(state.assets.length>0);
 assert.equal((await request(handler,'/')).status,200);
 const asset=state.assets[0];assert(asset.width>0&&asset.height>0);
 const image=await request(handler,asset.url);assert.equal(image.status,200);assert.match(image.headers['Cache-Control'],/immutable/);
 const revalidated=await request(handler,asset.url,{'if-none-match':image.headers.ETag});assert.equal(revalidated.status,304);
 const unversioned=await request(handler,asset.url.split('?')[0]);assert.match(unversioned.headers['Cache-Control'],/no-cache/);
});

test('changing an image invalidates its cache even during the short vault-index reuse window',async()=>{
 const {mkdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');const {resolve,join,sep}=await import('node:path');
 const base=resolve('.preview-data');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'cache-test-'));
 try{
  const image=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');await writeFile(join(root,'map.gif'),image);
  const handler=createRequestHandler({...serverConfig({}),vaultPath:root});
  const initial=JSON.parse((await request(handler,'/api/state')).body),url=initial.assets[0].url;
  const first=await request(handler,url);assert.match(first.headers['Cache-Control'],/immutable/);
  await writeFile(join(root,'map.gif'),Buffer.concat([image,Buffer.from('changed')]));
  const changed=await request(handler,url,{'if-none-match':first.headers.ETag});assert.equal(changed.status,200);assert.notEqual(changed.headers.ETag,first.headers.ETag);assert.match(changed.headers['Cache-Control'],/no-cache/);
  const latest=JSON.parse((await request(handler,'/api/state')).body);assert.notEqual(latest.assets[0].url,url);
  assert.match((await request(handler,latest.assets[0].url)).headers['Cache-Control'],/immutable/);
 }finally{assert(root.startsWith(base+sep+'cache-test-'));await rm(root,{recursive:true,force:true})}
});

test('portrait thumbnails are small, cached, and refresh after an image edit',async()=>{
 const sharp=(await import('sharp')).default;
 const {mkdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');const {resolve,join,sep}=await import('node:path');
 const base=resolve('.preview-data');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'portrait-test-'));
 try{
  const vault=join(root,'vault');await mkdir(vault);
  await writeFile(join(vault,'portrait.png'),await sharp({create:{width:1200,height:1500,channels:3,background:'#4b5731'}}).png().toBuffer());
  const handler=createRequestHandler({...serverConfig({}),vaultPath:vault,dataPath:join(root,'cache')});
  const initial=JSON.parse((await request(handler,'/api/state')).body),asset=initial.assets[0];
  const thumb=await request(handler,asset.thumbnailUrl);assert.equal(thumb.status,200);assert.equal(thumb.headers['Content-Type'],'image/webp');
  const dimensions=await sharp(thumb.bytes).metadata();assert.equal(dimensions.width,320);assert.equal(dimensions.height,400);
  assert.match(thumb.headers['Cache-Control'],/immutable/);
  assert.equal((await request(handler,asset.thumbnailUrl,{'if-none-match':thumb.headers.ETag})).status,304);
  const original=await request(handler,asset.url);assert.equal((await sharp(original.bytes).metadata()).width,1200);
  await writeFile(join(vault,'portrait.png'),await sharp({create:{width:800,height:400,channels:3,background:'#654321'}}).png().toBuffer());
  const changed=await request(handler,asset.thumbnailUrl,{'if-none-match':thumb.headers.ETag});
  assert.equal(changed.status,200);assert.notEqual(changed.headers.ETag,thumb.headers.ETag);assert.match(changed.headers['Cache-Control'],/no-cache/);
  assert.equal((await sharp(changed.bytes).metadata()).height,160);
 }finally{assert(root.startsWith(base+sep+'portrait-test-'));await rm(root,{recursive:true,force:true})}
});
