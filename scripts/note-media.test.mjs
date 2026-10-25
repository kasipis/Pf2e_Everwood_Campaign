import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {displayNoteTitle,parseZoomMap,transformNoteMedia,buildVaultAtlas,partitionVaultNotes,matchingMapNote,markerDefinition,resolveMedia,worldAtlasMap} from '../worker/note-media.js';
import worker from '../dist/server/index.js';
const assets=[{path:'Assets/Town.webp',url:'/local/file/town?v=1'},{path:'Assets/Roads.png',url:'/local/file/roads?v=1'}];
const note={id:'town',path:'locations/Region/Town.md',title:'Town',text:'```zoommap\nimage: Assets/Town.webp\nmaxZoom: 8\n```'};
test('World atlas opens the world map regardless of alphabetical map order',async()=>{
 const maps=[{id:'city',name:'Grammont',sourcePath:'locations/Grammont Region/Grammont.md'},{id:'isles',name:'Colonial Isles',sourcePath:'locations/World map/Colonial Isles.md'},{id:'world',name:'World',sourcePath:'locations/World map/World.md'}];
 assert.equal(worldAtlasMap(maps).id,'world');
 const html=await readFile('worker/app.html','utf8');const start=html.indexOf('function setView('),end=html.indexOf("\ndocument.addEventListener('click'",start);
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){},toggle(name,hidden){this.hidden=hidden}}});return nodes.get(id)};
 let loaded;
 const context=vm.createContext({displayNoteTitle,state:{maps},activeMap:'city',worldAtlasMap,mapTrail:[{id:'city'}],document:{querySelectorAll:()=>[]},$,
  clearNoteMaps(){},loadMap:()=>{loaded=context.activeMap},render(){},updateReturnButton(){},setTimeout(){}});
 new vm.Script(html.slice(start,end)+"\nsetView('atlas')").runInContext(context);
 assert.equal(context.activeMap,'world');assert.equal(loaded,'world');assert.equal(context.view,'atlas');assert.equal(context.mapTrail.length,0);
 assert.equal($('pageTitle').textContent,'World atlas');assert.equal($('atlasView').classList.hidden,false);assert.equal($('mapsView').classList.hidden,true);
});
test('Zoom Map blocks parse settings, quoted paths, comments and image layers',()=>{
 const config=parseZoomMap('image: "Assets/Town.webp"\nheight: 650px\nmaxZoom: 8 # scale\nimageRendering: pixelated\nimageOverlays:\n  - path: Assets/Roads.png\n    name: Roads\n    visible: true');
 assert.equal(config.image,'Assets/Town.webp');assert.equal(config.height,650);assert.equal(config.maxZoom,8);assert.equal(config.imageOverlays[0].path,'Assets/Roads.png');
 const blocks=[];const rendered=transformNoteMedia('`![[literal.png]]`\n```zoom-map\nimage: [[Town.webp]]\n```\n```text\n[[Literal]]\n```',{image:()=>assert.fail(),wikilink:()=>assert.fail(),map:c=>{blocks.push(c);return 'MAP'}});
 assert.equal(blocks[0].image,'Town.webp');assert(rendered.includes('[[Literal]]'));
});
test('native JSON markers retain top-left coordinates, links and hidden-layer rules',async()=>{
 const data={path:'Assets/Town.webp.markers.json',markers:[{id:'guild',x:0.25,y:0.3,iconKey:'building',link:'Guild'},{id:'hidden',x:0.5,y:0.5,layer:'hidden'}],layers:[{id:'hidden',visible:false}]};
 const state={notes:[note,{id:'guild',path:'Locations/Guild.md',title:'Guild'}],assets,maps:[],zoomData:{files:[data]}};
 state.maps=await buildVaultAtlas(state,async()=>({width:2000,height:1000}));const map=state.maps[0];
 assert.equal(map.pins.length,1);assert.equal(map.pins[0].x,500);assert.equal(map.pins[0].y,300);assert.equal(map.pins[0].noteId,'guild');assert.equal(map.maxZoom,8);
 data.markers[0].x=0.5;state.maps=await buildVaultAtlas(state,async()=>assert.fail('Unchanged image remeasured'));assert.equal(state.maps[0].pins[0].x,1000);
 data.markers=[];state.maps=await buildVaultAtlas(state,async()=>assert.fail());assert.deepEqual(state.maps[0].pins,[]);
});
test('inline storage, explicit sidecar paths and visible overlays are supported',async()=>{
 const inline={...note,text:'```zoommap\nid: town\nstorage: note\nimage: [[Town.webp]]\n```\n%%\nZOOMMAP-DATA id=town\n{"markers":[{"id":"p","x":0.5,"y":0.25}]}\n/ZOOMMAP-DATA\n%%'};
 const maps=await buildVaultAtlas({notes:[inline],maps:[],assets},async()=>({width:100,height:200}));assert.equal(maps[0].pins[0].y,50);
 const explicit={...note,text:'```zoommap\nimage: Assets/Town.webp\nmarkers: Pins/Town.markers.json\nimageOverlays:\n  - path: Assets/Roads.png\n    visible: true\n```'};
 const result=await buildVaultAtlas({notes:[explicit],maps:[],assets,zoomData:{files:[{path:'Pins/Town.markers.json',markers:[]}]}},async()=>({width:100,height:100}));assert.equal(result[0].overlays[0].url,assets[1].url);
});
test('gallery contains only Zoom Map notes and descriptions match filenames',()=>{
 const normal={id:'description',path:'Locations/Town.md',title:'Town'};
 const groups=partitionVaultNotes([note,normal,{path:'locations/Empty.md',text:''}]);assert.equal(groups.mapNotes.length,1);assert.equal(groups.notes.length,2);
 assert.equal(matchingMapNote([note,normal],{sourcePath:note.path}).id,'town');assert.equal(resolveMedia(assets,'../../Assets/Town.webp',note.path),assets[0]);
});
test('Zoom Map icon library supplies marker bubble colors and image icons',()=>{
 const icon={key:'building',pathOrDataUrl:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg><path fill="#2a4733"/></svg>')};
 const definition=markerDefinition({zoomData:{icons:[icon]}},'building');assert.equal(definition.color,'#2a4733');assert(definition.isImage);
});
test('multiple map blocks have separate identities and missing artwork has an error',async()=>{
 const multi={...note,text:note.text+'\n```zoommap\nimage: Missing.webp\n```'};
 const maps=await buildVaultAtlas({notes:[multi],assets,maps:[]},async()=>({width:100,height:100}));assert.equal(maps.length,2);assert.notEqual(maps[0].id,maps[1].id);assert.match(maps[1].error,/not found/);
});
test('notes open as full pages and never invoke popup rendering',async()=>{
 const html=await readFile('worker/app.html','utf8');const source=html.slice(html.indexOf('function openNote(id){'),html.indexOf('\nasync function mountNoteMap'));
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{dataset:{},innerHTML:'',textContent:''});return elements.get(id)};
 let view;const context=vm.createContext({displayNoteTitle,state:{notes:[{id:'guild',title:'Guild',path:'Locations/Guild.md',text:'Guild'}]},$,isMapNote:()=>false,view:'notes',viewingVaultMap:false,noteOrigin:null,recent:[],clearNoteMaps(){},setView:v=>{view=v},buildNoteHTML:()=>'<p>Guild</p>',wireNoteContent(){},render(){},document:{},window:{scrollTo(){}}});
 new vm.Script(source+"\nopenNote('guild')").runInContext(context);assert.equal(view,'note');assert.equal($('noteBody').innerHTML,'<p>Guild</p>');
});
test('Back restores native image-space position and zoom across linked maps',async()=>{
 const html=await readFile('worker/app.html','utf8');const source=html.slice(html.indexOf('let viewingVaultMap=false;'),html.indexOf('\nfunction render(){'));
 const $=()=>({classList:{add(){},remove(){},toggle(){}},textContent:''});let center={x:500,y:300},zoom=0.5;
 const context=vm.createContext({displayNoteTitle,document:{},worldAtlasMap,state:{maps:['a','b','c'].map(id=>({id,sourceNoteId:id,name:id}))},activeMap:'a',view:'maps',$,
 map:{getCenter:()=>({...center}),getZoom:()=>zoom,setView:(c,z)=>{center=c;zoom=z},setBackAvailable(){}},clearNoteMaps(){},setView:v=>{context.view=v},loadMap:()=>{center={x:0,y:0};zoom=1},setTimeout(){},toast:()=>assert.fail()});
 new vm.Script(source+"\nviewingVaultMap=true;openAtlasMap('b')").runInContext(context);center={x:1000,y:700};zoom=2;
 new vm.Script("openAtlasMap('c');returnToMap()").runInContext(context);assert.equal(context.activeMap,'b');assert.deepEqual(center,{x:1000,y:700});assert.equal(zoom,2);
 new vm.Script('returnToMap()').runInContext(context);assert.equal(context.activeMap,'a');assert.deepEqual(center,{x:500,y:300});assert.equal(zoom,0.5);
});
test('built site embeds its renderer without external map scripts',async()=>{
 const html=await(await worker.fetch(new Request('http://localhost/'),{})).text();assert(html.includes('class ZoomMapRenderer'));
 new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
 const external=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);assert(external.every(url=>/marked|dompurify/.test(url)));
});

test('map metadata removes all image downloads and decoding from atlas startup',async()=>{
 const notes=Array.from({length:11},(_,i)=>({id:'map-'+i,path:'locations/Map '+i+'.md',title:'Map '+i,text:'```zoommap\nimage: Assets/Map'+i+'.webp\n```'}));
 const assets=notes.map((_,i)=>({path:'Assets/Map'+i+'.webp',url:'/local/file/map'+i+'?v=test',width:3500,height:2000}));
 let decoded=0;const maps=await buildVaultAtlas({notes,assets,maps:[]},async()=>{decoded++;throw Error('Should not load unrelated images')});
 assert.equal(decoded,0);assert.equal(maps.length,11);assert(maps.every(map=>map.width===3500&&map.height===2000&&!map.error));
});

test('ITS character callouts preserve their content and local section links',async()=>{
 const {configureNoteLayout,noteHeadingId,stripNoteComments}=await import('../worker/note-media.js');
 const calls=[];const renderer={blockquote:token=>'<blockquote>'+token.text+'</blockquote>',parser:{parseInline:tokens=>tokens.map(t=>t.text).join('')}};
 const marked={parse:(text,options)=>{calls.push(text);assert.equal(options.renderer,renderer);return '<p>'+text+'</p>'}};
 configureNoteLayout(renderer,marked);
 const info=renderer.blockquote({text:'[!infobox|wikipedia]\n# Archie\n![Portrait](Archie.webp)\n| Name | Archie |'});
 assert.match(info,/^<aside class="note-infobox">/);assert.match(info,/Archie.webp/);assert(!info.includes('[!infobox'));
 assert.match(renderer.blockquote({text:'[!toc] Contents\n- Appearance'}),/^<nav class="note-contents"/);
 assert.equal(renderer.blockquote({text:'Ordinary quote'}),'<blockquote>Ordinary quote</blockquote>');
 const heading=renderer.heading({depth:2,text:'Abilities and equipment',tokens:[{text:'Abilities and equipment'}]});
 assert(heading.includes('id="'+noteHeadingId('Abilities and equipment')+'"'));
 assert.equal(stripNoteComments('Visible %% secret\ncomment %% text'), 'Visible  text');
 assert.equal(stripNoteComments('`%% literal %%`'),'`%% literal %%`');
 const html=await readFile('worker/app.html','utf8');
 assert(html.includes("target.startsWith('#')"));assert(html.includes('scrollIntoView'));
});

test('overview uses thumbnail portraits beside text and preserves unchanged cards',async()=>{
 const {characterPortrait,stripNoteComments,notePreview,displayNoteTitle}=await import('../worker/note-media.js');
 const html=await readFile('worker/app.html','utf8');const source=html.slice(html.indexOf('function noteCard(n){'),html.indexOf('function setView('));
 const asset={path:'Assets/Portrait.webp',url:'/local/file/original?v=1',thumbnailUrl:'/local/file/original?v=1&thumbnail=portrait'};
 const context=vm.createContext({displayNoteTitle,state:{assets:[asset]},characterPortrait,stripNoteComments,notePreview,displayNoteTitle,esc:s=>String(s)});
 new vm.Script(source).runInContext(context);
 const markup=context.noteCard({id:'a',title:'Archie',path:'Characters/Archie.md',text:'# Archie\n> [!infobox|wikipedia]\n> ![[Assets/Portrait.webp]]\n\nA cheerful adventurer.'});
 assert(!markup.includes('Characters/Archie.md'));assert(!markup.includes('card-label'));assert(!markup.includes('card-footer'));assert(markup.includes('A cheerful adventurer.'));assert(markup.includes('has-portrait'));assert(markup.includes('src="'+asset.thumbnailUrl+'"'));assert(markup.includes('loading="lazy"'));
 assert(markup.indexOf('card-copy')<markup.indexOf('card-portrait'));assert(markup.includes('width="96" height="120"'));
 let replacements=0;const container={set innerHTML(value){replacements++}};const cacheContext=vm.createContext({displayNoteTitle,$:()=>container});
 new vm.Script(html.slice(html.indexOf('function updateNoteCards('),html.indexOf('function render(){'))).runInContext(cacheContext);
 cacheContext.updateNoteCards('allNotes',markup);cacheContext.updateNoteCards('allNotes',markup);assert.equal(replacements,1);
 cacheContext.updateNoteCards('allNotes',markup+'changed');assert.equal(replacements,2);
});

test('location Zoom Maps appear in gallery and atlas after merging folders',async()=>{
 const location={...note,path:'locations/Harjah Region/Town.md'};
 const plain={id:'house',path:'locations/House.md',text:'# House'};
 const windows={...note,id:'windows',path:'Locations\\Region\\Town.md',text:note.text.replace('zoommap','zoom-map')};
 const groups=partitionVaultNotes([location,plain,windows]);
 assert.deepEqual(groups.mapNotes.map(n=>n.id),['town','windows']);
 assert.deepEqual(groups.notes.map(n=>n.id),['house']);
 const maps=await buildVaultAtlas({notes:[location,plain,windows],assets,maps:[]},async()=>({width:100,height:100}));
 assert.equal(maps.length,2);assert(maps.every(m=>!m.error));
 assert.equal(maps[0].sourcePath,location.path);
 assert.equal(worldAtlasMap([{id:'town',name:'Town'},{id:'world',sourcePath:'locations/World map/World.md'}]).id,'world');
});

test('retired Maps folder has no special handling and descriptions use the exact location',async()=>{
 const legacy={...note,id:'legacy',path:'Maps/Region/Town.md'};
 const current={...note,text:'# Town\nBefore the map.\n'+note.text+'\n## History\nAfter the map.'};
 const duplicate={id:'duplicate',path:'Characters/Town.md',text:'Wrong description'};
 const groups=partitionVaultNotes([legacy,current,duplicate]);
 assert.deepEqual(groups.mapNotes.map(n=>n.id),['town']);
 assert.deepEqual(groups.notes.map(n=>n.id),['legacy','duplicate']);
 assert.equal(matchingMapNote([duplicate,legacy,current],{sourcePath:current.path}).id,'town');
 assert.equal(matchingMapNote([duplicate,legacy],{sourcePath:current.path}),null);
 const maps=await buildVaultAtlas({notes:[legacy,current],assets,maps:[]},async()=>({width:100,height:100}));
 assert.equal(maps.length,1);assert.equal(maps[0].sourceNoteId,'town');
 const html=await readFile('worker/app.html','utf8');
 const source=html.slice(html.indexOf("let mapNoteKey='';"),html.indexOf('function openNote(id){'));
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{toggle(key,value){this.hidden=value}}});return nodes.get(id)};
 let rendered;
 const context=vm.createContext({displayNoteTitle,$,state:{notes:[current,duplicate],assets:[]},current:()=>maps[0],matchingMapNote,
 buildNoteHTML:(n,configs,omitMaps)=>{assert.equal(omitMaps,true);rendered=n;return 'Before the map. After the map.'},wireNoteContent(){}});
 new vm.Script(source+'\nrenderMapNote()').runInContext(context);
 assert.equal(rendered,current);assert.equal($('mapNotePanel').classList.hidden,false);
 assert.match($('mapNoteText').innerHTML,/Before the map.*After the map/);
});

test('note URLs encode names, distinguish duplicate filenames, and resolve direct loads',async()=>{
 const {noteURL,routeNote}=await import('../worker/note-media.js');
 const bert={id:'bert',path:'Characters/Bert.md'},space={id:'space',path:'Characters/Kevin Bloet.md'};
 const a={id:'a',path:'locations/City/Town.md'},b={id:'b',path:'Characters/Town.md'};
 const notes=[bert,space,a,b];
 assert.equal(noteURL(bert,notes),'/notes/Bert');assert.equal(noteURL(space,notes),'/notes/Kevin%20Bloet');
 for(const note of notes)assert.equal(routeNote(notes,noteURL(note,notes)),note);
 assert.equal(routeNote(notes,'/notes/Town'),null);assert.equal(routeNote(notes,'/notes/%broken'),null);
 for(const path of ['/notes/Bert','/notes/Kevin%20Bloet','/notes/locations/City/Town','/notes','/maps']){
  const response=await worker.fetch(new Request('http://localhost'+path),{});
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/html/);
 }
});

test('browser routing updates note and map URLs and restores back navigation',async()=>{
 const {noteURL,routeNote}=await import('../worker/note-media.js');
 const html=await readFile('worker/app.html','utf8');
 const source=html.slice(html.indexOf('// Synchronize note navigation'),html.indexOf('(async()=>{try{const r=await api'));
 const notes=[{id:'bert',path:'Characters/Bert.md'},{id:'town',path:'locations/Town.md'}];
 const location={pathname:'/notes/Bert'},paths=[];let opened,listener;
 const context=vm.createContext({displayNoteTitle,state:{notes,maps:[{id:'map',sourceNoteId:'town'}]},location,noteURL,routeNote,
 history:{pushState(a,b,path){paths.push(path);location.pathname=path}},window:{addEventListener(type,fn){listener=fn}},
 setView(){},openNote(id){opened=id;if(id==='town')context.openAtlasMap('map')},openAtlasMap(){context.setView('maps')},$:()=>({})});
 new vm.Script(source+'\nroutingReady=true;restoreRoute()').runInContext(context);
 assert.equal(opened,'bert');assert.equal(paths.length,0);
 new vm.Script("openNote('town')").runInContext(context);assert.deepEqual(paths,['/notes/Town']);
 new vm.Script("setView('notes')").runInContext(context);assert.equal(location.pathname,'/notes');
 location.pathname='/notes/Bert';listener();assert.equal(opened,'bert');assert.equal(paths.length,2);
});

test('note tree mirrors nested vault paths and sorts folders and notes',async()=>{
 const {buildNoteTree,displayNoteTitle}=await import('../worker/note-media.js');
 const notes=[{id:'b',path:'Characters/Bert.md',title:'Bert'},{id:'a',path:'Characters/Players/Archie.md',title:'Archie'},
 {id:'world',path:'locations/World map/World.md',title:'World'},{id:'home',path:'Home.md',title:'Home'},
 {id:'c',path:'Characters/Alice.md',title:'Alice'}];
 const root=buildNoteTree(notes);
 assert.deepEqual(root.folders.map(f=>f.name),['Characters','locations']);
 assert.deepEqual(root.notes.map(n=>n.id),['home']);
 assert.deepEqual(root.folders[0].notes.map(n=>n.id),['c','b']);
 assert.equal(root.folders[0].folders[0].path,'Characters/Players');
 assert.equal(root.folders[1].folders[0].notes[0].id,'world');
});

test('folder tree expands, collapses and temporarily reveals search results',async()=>{
 const {buildNoteTree,displayNoteTitle}=await import('../worker/note-media.js');
 const html=await readFile('worker/app.html','utf8');
 const source=html.slice(html.indexOf('const expandedNoteFolders='),html.indexOf('function noteCard(n){'));
 const container={innerHTML:'',addEventListener(type,callback){this.toggle=callback}},search={value:''};
 const context=vm.createContext({displayNoteTitle,buildNoteTree,displayNoteTitle,$:id=>id==='allNotes'?container:search,esc:s=>String(s),noteCard:n=>'<button data-note="'+n.id+'">'+n.title+'</button>',updateNoteCards:(id,html)=>{container.innerHTML=html}});
 new vm.Script(source).runInContext(context);
 assert.equal(context.folderPresentation('Characters 🧙🏽‍♂️').emoji,'🧙🏽‍♂️');assert.equal(context.folderPresentation('Characters 🧙🏽‍♂️').label,'Characters');assert.equal(context.folderPresentation('Sessions').emoji,'');
 const notes=[{id:'b',path:'Characters/NPCs/Bert.md',title:'Bert'}];
 context.renderNoteTree(notes);assert(!container.innerHTML.includes(' open'));
 const folder={matches:()=>true,dataset:{folder:'Characters'},open:true};
 container.toggle({target:folder});context.renderNoteTree(notes);assert.match(container.innerHTML,/data-folder="Characters" open/);
 folder.open=false;container.toggle({target:folder});context.renderNoteTree(notes);assert(!container.innerHTML.includes(' open'));
 context.renderNoteTree(notes,'bert');assert.match(container.innerHTML,/data-folder="Characters\/NPCs" open/);
 context.renderNoteTree(notes);assert(!container.innerHTML.includes(' open'));
});

test('emoji folders preserve maps, portraits, old links and clean note URLs',async()=>{
 const {logicalPath,resolveVaultNote,characterPortrait,noteURL,routeNote,buildNoteTree}=await import('../worker/note-media.js');
 const bert={id:'bert',title:'Bert',path:'Characters 🧙/2. NPC/Bert.md',text:'![[Assets/Town.webp]]'};
 const town={...note,path:'locations 🗺️/Harjah Region/Town.md'};
 const world={id:'world',sourcePath:'locations 🗺️/World map/World.md'};
 const notes=[bert,town];
 assert.equal(logicalPath('Characters 🧙🏽‍♂️/Bert.md'),'Characters/Bert.md');
 assert.equal(partitionVaultNotes(notes).mapNotes[0],town);
 assert.equal(characterPortrait(bert,assets),assets[0].url);
 assert.equal(resolveVaultNote(notes,'Characters/Bert'),bert);
 assert.equal(resolveVaultNote(notes,'locations/Harjah Region/Town'),town);
 assert.equal(resolveVaultNote(notes,'Bert'),bert);
 assert.equal(noteURL(bert,notes),'/notes/Bert');
 assert.equal(routeNote(notes,'/notes/Characters/2.%20NPC/Bert'),bert);
 assert.equal(worldAtlasMap([world]).id,'world');
 assert.equal(buildNoteTree(notes).folders[0].name,'Characters 🧙');
 const maps=await buildVaultAtlas({notes,assets,maps:[],zoomData:{files:[{path:'Assets/Town.webp.markers.json',markers:[{id:'bert',x:0.5,y:0.5,link:'Characters/Bert'}]}]}},async()=>({width:100,height:100}));
 assert.equal(maps.length,1);assert.equal(maps[0].pins[0].noteId,'bert');
});

test('numbered notes keep numeric filename order while labels hide prefixes and map previews omit configuration',async()=>{
 const {buildNoteTree,displayNoteTitle,notePreview}=await import('../worker/note-media.js');
 const notes=[{path:'1. Places/10. Last.md',title:'Last'},{path:'1. Places/2. Second.md',title:'Second'},{path:'1. Places/1. First.md',title:'First'}];
 assert.deepEqual(buildNoteTree(notes).folders[0].notes.map(n=>n.title),['First','Second','Last']);
 assert.equal(displayNoteTitle('12. Characters'),'Characters');assert.equal(displayNoteTitle('Session 01'),'Session 01');
 const preview=notePreview({...note,text:'# Town\nA bustling city.\n'+note.text+'\nA secret below.\n%% ZOOMMAP-DATA hidden %%'}, {assets});
 assert.equal(preview.artwork,assets[0].url);assert.equal(preview.isMap,true);
 assert.match(preview.excerpt,/A bustling city/);assert.match(preview.excerpt,/A secret below/);
 assert(!/zoommap|image:|maxZoom|Assets\/Town/i.test(preview.excerpt));
});

test('dead character previews are grayscale based on status rather than story mentions',async()=>{
 const {isDeadCharacter,notePreview}=await import('../worker/note-media.js');
 const dead={id:'bert',path:'Characters 🧙/2. NPC/Bert.md',title:'Bert',text:'> | **Status** | Dead |'};
 assert.equal(isDeadCharacter(dead),true);assert.equal(notePreview(dead,{assets:[]}).dead,true);
 for(const text of ['> | **Status** | Alive |\nHis friend is dead.','> | **Status** | Unknown |','%%\n> | **Status** | Dead |\n%%'])assert.equal(isDeadCharacter({...dead,text}),false);
 assert.equal(isDeadCharacter({...dead,text:'---\nstatus: dead\n---'}),true);
 assert.equal(isDeadCharacter({...dead,path:'locations/Town.md'}),false);
 const html=await readFile('worker/app.html','utf8');
 const source=html.slice(html.indexOf('function noteCard(n){'),html.indexOf('function setView('));
 const {displayNoteTitle}=await import('../worker/note-media.js');
 const context=vm.createContext({state:{assets:[]},notePreview,displayNoteTitle,esc:String});new vm.Script(source).runInContext(context);
 assert.match(context.noteCard(dead),/class="card is-dead"/);
 assert(!context.noteCard({...dead,text:'> | **Status** | Alive |'}).includes('is-dead'));
 assert.match(html,/\.card\.is-dead\{filter:grayscale\(1\)/);
});

test('missing and unknown characters use sepia and status-color preference disables both effects',async()=>{
 const {notePreview}=await import('../worker/note-media.js');
 const note={path:'Characters/Burvik.md',title:'Burvik'};
 for(const status of ['Missing','Unknown','UNKNOWN']){
  const result=notePreview({...note,text:'> | **Status** | '+status+' |'},{assets:[]});
  assert.equal(result.sepia,true);assert.equal(result.dead,false);
 }
 const dead=notePreview({...note,text:'status: Dead'},{assets:[]});assert.equal(dead.dead,true);assert.equal(dead.sepia,false);
 const alive=notePreview({...note,text:'status: Alive'},{assets:[]});assert.equal(alive.dead,false);assert.equal(alive.sepia,false);
 const html=await readFile('worker/app.html','utf8');
 const source=html.slice(html.indexOf('function applyStatusColors('),html.indexOf('// Synchronize note navigation'));
 let disabled,listener,checked;
 const button={setAttribute(name,value){checked=value}};
 const storage=new Map([['atlas-status-colors','false']]);
 const context=vm.createContext({document:{body:{classList:{toggle(name,value){disabled=value}}},querySelectorAll:()=>[button],addEventListener(type,fn){listener=fn}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
 new vm.Script(source).runInContext(context);assert.equal(disabled,true);assert.equal(checked,'false');
 let prevented=0,stopped=0;
 const event={target:{closest:()=>button},preventDefault(){prevented++},stopPropagation(){stopped++}};
 listener(event);assert.equal(disabled,false);assert.equal(checked,'true');assert.equal(storage.get('atlas-status-colors'),'true');
 listener(event);assert.equal(disabled,true);assert.equal(prevented,2);assert.equal(stopped,2);
 assert(!html.includes('id="statusColorsToggle"'));assert(html.includes('role="switch"'));
 assert(html.includes('body:not(.status-colors-off) .card.is-dead'));assert(html.includes('body:not(.status-colors-off) .card.is-sepia'));
});
