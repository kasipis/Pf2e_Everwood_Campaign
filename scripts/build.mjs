import {readFile,writeFile,mkdir} from 'node:fs/promises';
const vendors={};
const media=(await readFile('worker/note-media.js','utf8')).replace(/^export /gm,'');
const html=(await readFile('worker/app.html','utf8')).replace('/*__NOTE_MEDIA__*/',()=>media);
let bundledState=null;const bundledFiles={};
try{
 bundledState=JSON.parse(await readFile('published-vault/state.json','utf8'));
 for(const asset of bundledState.assets){const id=asset.url.split('/').pop();bundledFiles[id]={type:asset.type,data:(await readFile('published-vault/files/'+id)).toString('base64')}}
}catch(error){if(error.code!=='ENOENT')throw error}
const src=(await readFile('worker/index.js','utf8')).replace('/*__HTML__*/ ""',()=>JSON.stringify(html)).replace('/*__VENDORS__*/ {}',()=>JSON.stringify(vendors)).replace('/*__BUNDLED_STATE__*/ null',()=>JSON.stringify(bundledState)).replace('/*__BUNDLED_FILES__*/ {}',()=>JSON.stringify(bundledFiles));
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',src);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Worker with embedded app and vendor assets');
