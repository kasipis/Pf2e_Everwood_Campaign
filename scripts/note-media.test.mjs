import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {parseZoomMap,transformNoteMedia,buildVaultAtlas,partitionVaultNotes,matchingMapNote,markerDefinition,resolveMedia,worldAtlasMap} from '../worker/note-media.js';
import worker from '../dist/server/index.js';
const assets=[{path:'Assets/Town.webp',url:'/local/file/town?v=1'},{path:'Assets/Roads.png',url:'/local/file/roads?v=1'}];
const note={id:'town',path:'Maps/Region/Town.md',title:'Town',text:'```zoommap\nimage: Assets/Town.webp\nmaxZoom: 8\n```'};
test('World atlas opens the world map regardless of alphabetical map order',async()=>{
 const maps=[{id:'city',name:'Grammont',sourcePath:'Maps/Grammont Region/Grammont.md'},{id:'isles',name:'Colonial Isles',sourcePath:'Maps/World map/Colonial Isles.md'},{id:'world',name:'World',sourcePath:'Maps/World map/World.md'}];
 assert.equal(worldAtlasMap(maps).id,'world');
 const html=await readFile('worker/app.html','utf8');const start=html.indexOf('function setView('),end=html.indexOf("\ndocument.addEventListener('click'",start);
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){},toggle(name,hidden){this.hidden=hidden}}});return nodes.get(id)};
 let loaded;
 const context=vm.createContext({state:{maps},activeMap:'city',worldAtlasMap,mapTrail:[{id:'city'}],document:{querySelectorAll:()=>[]},$,
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
 const groups=partitionVaultNotes([note,normal,{path:'Maps/Empty.md',text:''}]);assert.equal(groups.mapNotes.length,1);assert.equal(groups.notes.length,1);
 assert.equal(matchingMapNote([note,normal],{sourcePath:note.path}).id,'description');assert.equal(resolveMedia(assets,'../../Assets/Town.webp',note.path),assets[0]);
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
 let view;const context=vm.createContext({state:{notes:[{id:'guild',title:'Guild',path:'Locations/Guild.md',text:'Guild'}]},$,isMapNote:()=>false,view:'notes',viewingVaultMap:false,noteOrigin:null,recent:[],clearNoteMaps(){},setView:v=>{view=v},buildNoteHTML:()=>'<p>Guild</p>',wireNoteContent(){},render(){},document:{},window:{scrollTo(){}}});
 new vm.Script(source+"\nopenNote('guild')").runInContext(context);assert.equal(view,'note');assert.equal($('noteBody').innerHTML,'<p>Guild</p>');
});
test('Back restores native image-space position and zoom across linked maps',async()=>{
 const html=await readFile('worker/app.html','utf8');const source=html.slice(html.indexOf('let viewingVaultMap=false;'),html.indexOf('\nfunction render(){'));
 const $=()=>({classList:{add(){},remove(){},toggle(){}},textContent:''});let center={x:500,y:300},zoom=0.5;
 const context=vm.createContext({document:{},worldAtlasMap,state:{maps:['a','b','c'].map(id=>({id,sourceNoteId:id,name:id}))},activeMap:'a',view:'maps',$,
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
