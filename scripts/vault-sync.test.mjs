import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rename,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const testDirectory=fileURLToPath(new URL('../.preview-data/',import.meta.url));
import {createVaultSync} from './vault-sync.mjs';

test('vault detects nested notes, edits, image replacements, renames and deletions',async()=>{
 await mkdir(testDirectory,{recursive:true});
 const root=await mkdtemp(join(testDirectory,'atlas-sync-'));
 try{
  await mkdir(join(root,'Sessions'));await mkdir(join(root,'.obsidian'));
  await writeFile(join(root,'.obsidian','private.md'),'hidden');
  await writeFile(join(root,'Sessions','One.md'),'# One\nFirst');
  await writeFile(join(root,'map.png'),'image one');
  const sync=createVaultSync(root),first=await sync.snapshot();
  assert.equal(first.notes.length,1);assert.equal(first.notes[0].path,'Sessions/One.md');
  assert.equal(first.assets.length,1);
  await writeFile(join(root,'Commented map.md'),'```zoommap\nimage: map.png\n# Map view limits\nminZoom: 0.2\n```');
  const commented=await sync.snapshot();assert.equal(commented.notes.find(n=>n.path==='Commented map.md').title,'Commented map');
  await unlink(join(root,'Commented map.md'));
  assert.equal((await sync.snapshot()).revision,first.revision);
  const plugin=join(root,'.obsidian','plugins','zoom-map');await mkdir(plugin,{recursive:true});
  const pluginPath=join(plugin,'data.json');await writeFile(pluginPath,JSON.stringify({icons:[{key:'building',pathOrDataUrl:'icon.svg'}],defaultIconKey:'building',privateSetting:'excluded'}));
  const configured=await sync.snapshot();assert.notEqual(configured.revision,first.revision);assert.equal(configured.zoomData.defaultIconKey,'building');assert.equal(configured.zoomData.privateSetting,undefined);
  const sidecar=join(root,'map.png.markers.json');
  await writeFile(sidecar,JSON.stringify({markers:[{id:'zoom',x:0.5,y:0.25}],layers:[]}));
  const zoom=await sync.snapshot();assert.notEqual(zoom.revision,configured.revision);
  assert.equal(zoom.zoomData.files[0].path,'map.png.markers.json');assert.equal(zoom.notes.length,1);assert.equal(zoom.assets.length,1);
  await writeFile(sidecar,JSON.stringify({markers:[],layers:[]}));const zoomDeleted=await sync.snapshot();
  assert.notEqual(zoomDeleted.revision,zoom.revision);assert.equal(zoomDeleted.zoomData.files[0].markers.length,0);
  await writeFile(join(root,'Sessions','One.md'),'# One\nEdited content');
  await writeFile(join(root,'map.png'),'replacement image');
  const edited=await sync.snapshot();
  assert.notEqual(edited.revision,first.revision);assert.equal(edited.notes[0].id,first.notes[0].id);
  assert.match(edited.notes[0].text,/Edited content/);assert.notEqual(edited.assets[0].url,first.assets[0].url);
  assert.equal(edited.files.has('../outside.png'),false);
  await rename(join(root,'Sessions','One.md'),join(root,'Sessions','Two.md'));
  const renamed=await sync.snapshot();assert.equal(renamed.notes[0].path,'Sessions/Two.md');
  assert.notEqual(renamed.revision,edited.revision);
  await unlink(join(root,'Sessions','Two.md'));await unlink(join(root,'map.png'));
  const deleted=await sync.snapshot();assert.deepEqual(deleted.notes,[]);assert.deepEqual(deleted.assets,[]);
 }finally{
  // mkdtemp creates this test-owned directory directly inside the local data folder.
  assert.equal(root.startsWith(join(testDirectory,'atlas-sync-')),true);
  await rm(root,{recursive:true,force:true});
 }
});

// Exercise the real HTTP handler without requiring sandbox loopback networking.
test('local API reflects the vault and preserves saved maps',async()=>{
 const {handleRequest}=await import('./preview.mjs');
 const {Readable}=await import('node:stream');
 const vaultRoot=fileURLToPath(new URL('../../Obsidian Campaign/',import.meta.url));
 const filename='sync-test-'+Date.now()+'.md',path=join(vaultRoot,filename);
 async function request(url,headers={}){
  const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:{host:'localhost:4173',...headers}});
  let code,body;const res={writeHead(status){code=status},end(data){body=String(data)}};
  await handleRequest(req,res);return{code,body};
 }
 const before=JSON.parse((await request('/api/state')).body);
 try{
  assert.equal((await request('/')).code,200);
  await writeFile(path,'# Live test\nFirst version');
  const created=JSON.parse((await request('/api/state')).body);assert(created.notes.some(n=>n.path===filename));
  await writeFile(path,'# Live test\nSecond version updated');
  const updated=JSON.parse((await request('/api/state')).body);
  assert.match(updated.notes.find(n=>n.path===filename).text,/Second version/);
  assert.notEqual(updated.localRevision,created.localRevision);assert.deepEqual(updated.maps,before.maps);
  assert.equal((await request('/api/local-vault',{origin:'https://untrusted.example'})).code,403);
  assert.equal((await request('/local/file/missing.png')).code,404);
  await unlink(path);
  const removed=JSON.parse((await request('/api/state')).body);
  assert(!removed.notes.some(n=>n.path===filename));assert.equal(removed.localRevision,before.localRevision);
 }finally{await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error})}
});
