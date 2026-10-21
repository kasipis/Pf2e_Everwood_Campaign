import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createVaultSync} from './vault-sync.mjs';
const snapshot=await createVaultSync('../Obsidian Campaign').snapshot();
await mkdir('published-vault/files',{recursive:true});
let saved={maps:[]};try{saved=JSON.parse(await readFile('.preview-data/vault%2Fstate.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const assets=[];
for(const asset of snapshot.assets){const file=snapshot.files.get(asset.path),bytes=await readFile(file.absolute);const id='vault-'+createHash('sha256').update(bytes).digest('hex');await writeFile('published-vault/files/'+id,bytes);assets.push({...asset,url:'/api/file/'+id});}
// Keep existing website pins while the browser rebuilds maps from current vault notes.
const maps=(saved.maps||[]).filter(m=>!m.demo&&m.id!=='demo');
for(const map of maps){const original=snapshot.assets.find(a=>a.url===map.url||a.path===map.url?.split('/local/file/')[1]?.split('?')[0]);const exported=assets.find(a=>a.path===original?.path);if(exported)map.url=exported.url;}
const state={notes:snapshot.notes,assets,maps,leafletData:snapshot.leafletData,hosted:true};
await writeFile('published-vault/state.json',JSON.stringify(state));console.log('Exported '+state.notes.length+' notes and '+assets.length+' images for private hosting.');
