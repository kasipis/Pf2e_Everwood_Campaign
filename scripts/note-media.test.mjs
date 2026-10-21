import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolveMedia,mediaURL,parseNoteMap,transformNoteMedia,isMapNote,partitionVaultNotes,buildVaultAtlas,leafletPosition,matchingMapNote,markerDefinition} from '../worker/note-media.js';
import worker from '../dist/server/index.js';

const assets=[{path:'Assets/Harjah_Map.webp',url:'/local/file/Assets/Harjah_Map.webp?v=123'},
 {path:'Locations/Portrait one.png',url:'/api/file/portrait'}];
test('Obsidian marker types preserve their icon and color, including a configured default',async()=>{
 const state={leafletData:{defaultMarker:{type:'default',iconName:'map-marker',color:'#dddddd'},markerIcons:[
  {type:'Building',iconName:'building',color:'#dddddd',alpha:1},
  {type:'Dungeon',iconName:'dungeon',color:'#2a4733',alpha:0.8}]}};
 assert.equal(markerDefinition(state,'Building').iconName,'building');
 assert.equal(markerDefinition(state,'Dungeon').color,'#2a4733');
 assert.equal(markerDefinition(state,'Dungeon').alpha,0.8);
 assert.equal(markerDefinition(state,'unknown').iconName,'map-marker');
 state.notes=[{id:'map',path:'Maps/Town.md',title:'Town',text:'```leaflet\nid: town\nimage: [[Harjah_Map.webp]]\nmarker: Building, -1, 2, [[Guild]]\n```'}];state.assets=assets;state.maps=[];
 state.leafletData.mapMarkers=[{id:'town',markers:[{id:'dungeon',type:'Dungeon',loc:[-1,2]}]}];
 const maps=await buildVaultAtlas(state,async()=>({width:2000,height:1000}));
 assert.deepEqual(maps[0].pins.map(p=>p.kind),['Building','Dungeon']);
});
test('notes open as main pages without invoking the modal renderer',async()=>{
 const html=await readFile(new URL('../worker/app.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function openNote(id){'),html.indexOf('\nasync function mountNoteMap'));
 const nodes=new Map();const element=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',innerHTML:''});return nodes.get(id)};
 let selectedView,wired=0;
 const context=vm.createContext({state:{notes:[{id:'guild',title:'Guild',path:'Locations/Guild.md',text:'Guild text'}]},$:element,
  isMapNote,view:'notes',viewingVaultMap:false,noteOrigin:null,recent:[],closeModal(){},setView:v=>{selectedView=v},
  buildNoteHTML:()=>'<p>Guild text</p>',wireNoteContent:()=>wired++,render(){},window:{scrollTo(){}},document:{},
  modal:()=>assert.fail('Note opened a popup'),toast:()=>assert.fail('Note was not found')});
 new vm.Script(source+"\nopenNote('guild')").runInContext(context);
 assert.equal(selectedView,'note');assert.equal(context.activeNoteId,'guild');assert.equal(wired,1);
 assert.equal(element('noteBody').innerHTML,'<p>Guild text</p>');assert.equal(element('pageTitle').textContent,'Guild');
 assert.equal(context.document.title,'Guild · Everwood');
});
test('map descriptions match ordinary note filenames and never use the Maps note itself',()=>{
 const notes=[{id:'map',path:'Maps/Harjah.md',title:'Harjah'},
  {id:'town',path:'Locations/Harjah.md',title:'A different heading',text:'Town description'},
  {id:'other',path:'Locations/Other.md',title:'Harjah'}];
 assert.equal(matchingMapNote(notes,{sourcePath:'Maps/Harjah.md'}).id,'town');
 assert.equal(matchingMapNote(notes,{sourcePath:'Maps/Missing.md'}),null);
 assert.equal(matchingMapNote(notes.filter(n=>n.id!=='town'),{sourcePath:'Maps/Harjah.md'}),null);
});
test('Leaflet controls place Back bottom-left and toggle only the marker layer beside zoom',async()=>{
 const html=await readFile(new URL('../worker/app.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function addMapControls('),html.indexOf('\nfunction openNote('));
 const controls=[],layer={},image={},layers=new Set([layer,image]);let returned=0;
 const instance={hasLayer:l=>layers.has(l),removeLayer:l=>layers.delete(l),addLayer:l=>layers.add(l)};
 const L={control:options=>{const control={options,addTo(){this.node=this.onAdd();controls.push(this)}};return control},
  DomUtil:{create:(tag,className,parent)=>{const node={tag,className,children:[],attrs:{},setAttribute(key,value){this.attrs[key]=value}};parent?.children.push(node);return node}},
  DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}}};
 const context=vm.createContext({L,returnToMap:()=>returned++,updateReturnButton(){}});
 new vm.Script(source).runInContext(context);context.addMapControls(instance,layer,true);
 assert.equal(controls[0].options.position,'bottomleft');const back=controls[0].node.children[0];assert.equal(back.textContent,'Back');back.onclick();assert.equal(returned,1);
 assert.equal(controls[1].options.position,'topright');const toggle=controls[1].node.children[0];
 toggle.onclick();assert.equal(layers.has(layer),false);assert.equal(layers.has(image),true);assert.equal(toggle.textContent,'Show markers');
 toggle.onclick();assert.equal(layers.has(layer),true);assert.equal(toggle.textContent,'Hide markers');
});
test('Obsidian saved markers match map IDs and image layers, move live and disappear when deleted',async()=>{
 const note={id:'harjah',path:'Maps/Harjah.md',title:'Harjah',text:'```leaflet\nid: leaflet-map\nimage: [[Harjah_Map.webp]]\nmaxZoom: 10\n```'};
 const marker={id:'guild',loc:[-1,2],type:'default',link:'Adventurers Guild',layer:'%5B%5BHarjah_Map.webp%5D%5D',description:'Meet here'};
 const state={notes:[note,{id:'guild-note',path:'Locations/Adventurers Guild.md',title:'Adventurers Guild',text:''}],assets,maps:[],leafletData:{mapMarkers:[{id:'leaflet-map',markers:[marker,{...marker,id:'other-image',layer:'[[Portrait one.png]]'}]},{id:'unrelated',markers:[marker]}]}};
 const measure=async()=>({width:2000,height:1000});
 state.maps=await buildVaultAtlas(state,measure);
 const pin=state.maps[0].pins[0];assert.equal(state.maps[0].pins.length,1);
 assert.equal(pin.x,1024);assert.equal(pin.y,488);assert.equal(pin.noteId,'guild-note');assert.equal(pin.description,'Meet here');
 state.maps[0].pins.push({id:'site-only',name:'Camp'});
 marker.loc=[-0.5,1];state.maps=await buildVaultAtlas(state,measure);
 assert.equal(state.maps[0].pins[0].x,512);assert.equal(state.maps[0].pins[0].y,744);
 state.leafletData.mapMarkers=[];state.maps=await buildVaultAtlas(state,measure);
 assert.deepEqual(state.maps[0].pins.map(p=>p.id),['site-only']);
});
test('saved percentage coordinates and explicit map bounds retain marker alignment',()=>{
 assert.deepEqual(leafletPosition({}, {width:2000,height:1000},-1,2,[0.25,0.6]),{x:500,y:400});
 assert.deepEqual(leafletPosition({bounds:[[0,0],[100,100]]},{width:2000,height:1000},20,30),{x:30,y:20});
});
test('vault atlas maps keep edited, added and deleted pins across reloads and image changes',async()=>{
 const note={id:'harjah',path:'Maps/Harjah.md',title:'Harjah',text:'```leaflet\nimage: [[Harjah_Map.webp]]\nmarker: Settlement, 20, 30, [[Town]]\n```'};
 const state={notes:[note,{id:'town',path:'Locations/Town.md',title:'Town',text:''}],assets:structuredClone(assets),maps:[{id:'demo',pins:[]}]};
 const measure=async()=>({width:1400,height:1000});
 state.maps=await buildVaultAtlas(state,measure);
 assert.equal(state.maps.length,2);assert.equal(state.maps[1].pins[0].noteId,'town');
 state.maps[1].pins[0].name='Edited location';state.maps[1].pins.push({id:'custom',name:'Camp',kind:'Adventure',x:200,y:300});
 const reloaded=JSON.parse(JSON.stringify(state));reloaded.assets[0].url+='changed';
 reloaded.maps=await buildVaultAtlas(reloaded,async()=>({width:1600,height:1200}));
 assert.equal(reloaded.maps[1].pins[0].name,'Edited location');assert.equal(reloaded.maps[1].pins[1].name,'Camp');
 assert.equal(reloaded.maps[1].width,1600);assert.equal(reloaded.maps[0].id,'demo');
 reloaded.maps[1].pins=reloaded.maps[1].pins.filter(p=>p.id!=='source-0');
 reloaded.maps=await buildVaultAtlas(reloaded,measure);
 assert.deepEqual(reloaded.maps[1].pins.map(p=>p.id),['custom']);
 reloaded.notes=reloaded.notes.filter(n=>n.id!=='harjah');
 assert.deepEqual((await buildVaultAtlas(reloaded,measure)).map(m=>m.id),['demo']);
});
test('multiple map blocks are independent and missing artwork has an explicit error',async()=>{
 const state={notes:[{id:'multi',path:'Maps/Multi.md',title:'Multi',text:'```leaflet\nid: One\nimage: [[Harjah_Map.webp]]\n```\n```leaflet\nid: Two\nimage: [[missing.png]]\n```'}],assets,maps:[]};
 const maps=await buildVaultAtlas(state,async()=>({width:100,height:200}));
 assert.equal(maps.length,2);assert.notEqual(maps[0].id,maps[1].id);assert.match(maps[1].error,/not found/);
 maps[0].pins.push({id:'only-first'});assert.equal(maps[1].pins.length,0);
});
test('a vault map opens the shared atlas layout while navigation stays in My maps',async()=>{
 const html=await readFile(new URL('../worker/app.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function openAtlasMap('),html.indexOf('\nfunction render(){'));
 const nodes=new Map();const element=id=>{if(!nodes.has(id)){const hidden=new Set(['hidden']);nodes.set(id,{textContent:'',classList:{add:c=>hidden.add(c),remove:c=>hidden.delete(c),contains:c=>hidden.has(c)}})}return nodes.get(id)};
 let selectedView,loaded=0,closed=0;
 const context=vm.createContext({document:{},state:{maps:[{id:'vault-map',sourceNoteId:'note',name:'Harjah'}]},$:element,activeMap:null,view:'maps',viewingVaultMap:false,noteOrigin:null,updateReturnButton:()=>{},
  closeModal:()=>closed++,setView:v=>{selectedView=v},loadMap:()=>loaded++,setTimeout:()=>{},toast:()=>assert.fail('Map missing')});
 new vm.Script(source+"\nopenAtlasMap('vault-map')").runInContext(context);
 assert.equal(selectedView,'maps');assert.equal(loaded,1);assert.equal(closed,1);
 assert.equal(element('atlasView').classList.contains('hidden'),false);
 assert.equal(element('mapsView').classList.contains('hidden'),true);
 assert.equal(element('backToMaps').classList.contains('hidden'),false);
 assert.equal(element('pageTitle').textContent,'Harjah');
});
test('return navigation restores each previous map viewport and supports returning from a note',async()=>{
 const html=await readFile(new URL('../worker/app.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('let viewingVaultMap=false;'),html.indexOf('\nfunction render(){'));
 const nodes=new Map();const element=id=>{if(!nodes.has(id))nodes.set(id,{classList:{add(){},remove(){},toggle(){}},textContent:''});return nodes.get(id)};
 let center={lat:5,lng:10},zoom=2;
 const context=vm.createContext({document:{},state:{maps:['a','b','c'].map(id=>({id,sourceNoteId:id,name:id}))},activeMap:'a',view:'maps',$:element,
  map:{getCenter:()=>({...center}),getZoom:()=>zoom,setView:(value,z)=>{center=value;zoom=z}},
  closeModal:()=>{},setView:v=>{context.view=v},loadMap:()=>{center={lat:0,lng:0};zoom=0},setTimeout:()=>{},toast:()=>assert.fail('Unexpected missing map')});
 new vm.Script(source+"\nviewingVaultMap=true;openAtlasMap('b')").runInContext(context);
 center={lat:50,lng:60};zoom=3;
 new vm.Script("openAtlasMap('c');returnToMap()").runInContext(context);
 assert.equal(context.activeMap,'b');assert.deepEqual(center,{lat:50,lng:60});assert.equal(zoom,3);
 new vm.Script('noteOrigin=captureMapView();returnToMap()').runInContext(context);
 assert.equal(context.activeMap,'b');assert.equal(new vm.Script('mapTrail.length').runInContext(context),1);
 new vm.Script('returnToMap()').runInContext(context);
 assert.equal(context.activeMap,'a');assert.deepEqual(center,{lat:5,lng:10});assert.equal(zoom,2);
 assert.equal(new vm.Script('mapTrail.length').runInContext(context),0);
});
test('Maps notes and nested map notes are classified separately from ordinary notes',()=>{
 const notes=[{path:'Maps/Harjah_Map.md'},{path:'maps/Regions/North.md'},{path:'Maps\\Other.md'},
  {path:'Locations/Harjah.md'},{path:'Locations/Maps/Shop.md'},{path:'Maps-old/Archive.md'}];
 const result=partitionVaultNotes(notes);
 assert.equal(result.mapNotes.length,3);assert.equal(result.notes.length,3);
 assert(result.mapNotes.every(isMapNote));assert(result.notes.every(n=>!isMapNote(n)));
});
test('map notes render only in My maps, including search and after moving a file',async()=>{
 const html=await readFile(new URL('../worker/app.html',import.meta.url),'utf8');
 const render=html.slice(html.indexOf('function render(){'),html.indexOf('\nfunction noteCard'));
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:''});return elements.get(id)};
 const mapNote={id:'map-note',path:'Maps/Harjah_Map.md',title:'Harjah Map',text:'```leaflet\nimage: [[Harjah_Map.webp]]\n```'};
 const note={id:'note',path:'Locations/Harjah.md',title:'Harjah',text:'A town'};
 const state={notes:[mapNote,note],maps:[]};
 const context=vm.createContext({state,recent:['map-note','note'],$:element,partitionVaultNotes,
  esc:String,current:()=>null,renderPins:()=>{},renderMapNote:()=>{},noteCard:n=>'<button>'+n.title+'</button>'});
 new vm.Script(render+'\nrender()').runInContext(context);
 assert.match(element('allMaps').innerHTML,/Harjah Map/);
 for(const id of ['sideNotes','recentCards','allNotes'])assert(!element(id).innerHTML.includes('Harjah Map'));
 assert.equal(element('noteCount').textContent,1);assert.equal(element('mapCount').textContent,1);
 element('search').value='harjah_map';new vm.Script('render()').runInContext(context);
 assert.match(element('allMaps').innerHTML,/Harjah Map/);assert.match(element('allNotes').innerHTML,/No matching notes/);
 mapNote.path='Locations/Harjah_Map.md';element('search').value='';new vm.Script('render()').runInContext(context);
 assert.match(element('allNotes').innerHTML,/Harjah Map/);assert(!element('allMaps').innerHTML.includes('Harjah Map'));
});
test('pictures resolve from vault names, relative paths, encoded paths and existing served URLs',()=>{
 for(const target of ['Harjah_Map.webp','Assets/Harjah_Map.webp','../Assets/Harjah_Map.webp'])assert.equal(resolveMedia(assets,target,'Locations/Harjah.md'),assets[0]);
 assert.equal(resolveMedia(assets,'./Portrait%20one.png','Locations/Harjah.md'),assets[1]);
 assert.equal(mediaURL(assets,assets[0].url),assets[0].url);
 assert.equal(mediaURL(assets,'javascript:alert(1)'),null);
 assert.equal(mediaURL(assets,'missing.png'),null);
});
test('the actual Harjah block becomes one inline map and its picture remains an image',async()=>{
 const text=await readFile(new URL('../../Obsidian Campaign/Locations/Harjah.md',import.meta.url),'utf8');
 const maps=[],images=[];
 const result=transformNoteMedia(text,{image:path=>{images.push(path);return '<img>'},wikilink:()=>'<link>',map:config=>{maps.push(config);return '<map>'}});
 assert.equal(maps.length,1);assert.deepEqual(images,['Harjah_Map.webp']);
 assert.equal(maps[0].image,'Harjah_Map.webp');assert.equal(maps[0].height,500);
 assert.equal(maps[0].markers[0].link,'[[Note]]');assert.equal(maps[0].markers[0].lng,-82.983330);
 assert(!result.includes('```leaflet'));assert(result.includes('<img>'));assert(result.includes('<map>'));
});
test('code examples stay literal and multiple maps stay separate',()=>{
 const text='`![[example.png]]`\n```text\n[[Example]]\n```\n```leaflet\nimage: [[One.png]]\n```\n```leaflet\nimage: [[Two.png]]\n```';
 const maps=[];let images=0,links=0;
 const out=transformNoteMedia(text,{image:()=>{images++;return ''},wikilink:()=>{links++;return ''},map:c=>{maps.push(c.image);return 'MAP'}});
 assert.equal(images,0);assert.equal(links,0);assert.deepEqual(maps,['One.png','Two.png']);assert(out.includes('[[Example]]'));
});
test('map parsing validates bounds and clamps height',()=>{
 assert.deepEqual(parseNoteMap('bounds: [[0,0],[100,200]]').bounds,[[0,0],[100,200]]);
 assert.equal(parseNoteMap('bounds: evil()\nheight: 999999px').bounds,null);
 assert.equal(parseNoteMap('height: 999999px').height,900);
 assert.equal(parseNoteMap('image: [Map](../Assets/Map.png)').image,'../Assets/Map.png');
});
test('the served client including the media helper parses as JavaScript',async()=>{
 const html=await(await worker.fetch(new Request('http://localhost/'),{})).text();
 assert(html.includes('function transformNoteMedia'));
 new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
});
