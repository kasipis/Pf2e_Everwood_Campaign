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
  assert.equal((await sync.snapshot()).revision,first.revision);
  const plugin=join(root,'.obsidian','plugins','obsidian-leaflet-plugin');await mkdir(plugin,{recursive:true});
  const pluginPath=join(plugin,'data.json');
  await writeFile(pluginPath,JSON.stringify({mapMarkers:[{id:'town',markers:[{id:'pin',loc:[-1,2],link:'Guild'}]}],markerIcons:[{type:'Building',iconName:'building',color:'#dddddd'}],privateSetting:'excluded'}));
  const withMarker=await sync.snapshot();assert.notEqual(withMarker.revision,first.revision);
  assert.equal(withMarker.leafletData.mapMarkers[0].markers[0].link,'Guild');
  assert.equal(withMarker.leafletData.privateSetting,undefined);assert.equal(withMarker.notes.length,1);
  assert.equal(withMarker.leafletData.markerIcons[0].type,'Building');
  await writeFile(pluginPath,JSON.stringify({mapMarkers:withMarker.leafletData.mapMarkers,markerIcons:[{type:'Building',iconName:'building',color:'#123456'}]}));
  const recolored=await sync.snapshot();assert.notEqual(recolored.revision,withMarker.revision);
  assert.equal(recolored.leafletData.markerIcons[0].color,'#123456');
  assert.equal(withMarker.files.has('.obsidian/plugins/obsidian-leaflet-plugin/data.json'),false);
  await writeFile(pluginPath,JSON.stringify({mapMarkers:[{id:'town',markers:[]}]}));
  const withoutMarker=await sync.snapshot();assert.notEqual(withoutMarker.revision,withMarker.revision);
  assert.equal(withoutMarker.leafletData.mapMarkers[0].markers.length,0);
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
