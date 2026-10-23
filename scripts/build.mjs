import {readFile,writeFile,mkdir} from 'node:fs/promises';
const media=(await readFile('worker/note-media.js','utf8')).replace(/^export /gm,'');
const renderer=(await readFile('worker/zoom-map-renderer.js','utf8')).replace(/^export /gm,'');
const css=await readFile('worker/zoom-map-renderer.css','utf8');
const html=(await readFile('worker/app.html','utf8')).replace('/*__NOTE_MEDIA__*/',()=>media).replace('/*__ZOOM_RENDERER__*/',()=>renderer).replace('</style>',()=>css+'\n</style>');
const src=(await readFile('worker/index.js','utf8')).replace('/*__HTML__*/ ""',()=>JSON.stringify(html)).replace('/*__VENDORS__*/ {}','{}');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',src);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built local Everwood site with standalone Zoom Map renderer.');
