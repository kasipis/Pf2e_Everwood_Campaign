// Shared by the browser bundle and the Node regression tests.
export function isMapNote(note) {
  return /^maps\//i.test(String(note.path||'').replace(/\\/g,'/').replace(/^\.\//,''));
}
export function partitionVaultNotes(notes) {
  return {notes:notes.filter(note=>!isMapNote(note)),mapNotes:notes.filter(isMapNote)};
}
export function matchingMapNote(notes,map) {
  if(!map?.sourcePath)return null;
  const filename=mediaPath(map.sourcePath).split('/').pop().replace(/\.(md|markdown)$/i,'').toLowerCase();
  return notes.find(note=>!isMapNote(note)&&mediaPath(note.path).split('/').pop().replace(/\.(md|markdown)$/i,'').toLowerCase()===filename)||null;
}
export function markerDefinition(state,type='default') {
  const settings=state.leafletData||{};
  const definition=(settings.markerIcons||[]).find(icon=>icon.type===type)||settings.defaultMarker||{};
  const iconName=String(definition.iconName||'map-marker').replace(/^fa(?:s|r|b)?\s+fa-/,'').replace(/^fa-/,'');
  const color=/^#[\da-f]{3,8}$/i.test(definition.color||'')?definition.color:'#dddddd';
  return {type,iconName:/^[a-z0-9-]+$/i.test(iconName)||definition.isImage?iconName:'map-marker',
    color,alpha:Math.max(0,Math.min(1,Number(definition.alpha??1))),isImage:!!definition.isImage,
    size:Math.max(8,Math.min(40,16+(Number(definition.transform?.size)||0))),
    x:Math.max(-20,Math.min(20,Number(definition.transform?.x)||0)),y:Math.max(-20,Math.min(20,Number(definition.transform?.y)||0))};
}
export function leafletPosition(config,dimensions,lat,lng,percent) {
  if(config.bounds)return {x:lng,y:lat};
  if(Array.isArray(percent)&&percent.length===2&&percent.every(Number.isFinite))return {x:percent[0]*dimensions.width,y:(1-percent[1])*dimensions.height};
  // Obsidian unprojects image pixels at maxZoom - 1, with north at y=0.
  const factor=2**((Number(config.maxZoom)||10)-1);
  return {x:lng*factor,y:dimensions.height+lat*factor};
}
export function savedLeafletPins(state,config,note,dimensions) {
  if(!config.id)return [];
  const records=(state.leafletData?.mapMarkers||[]).filter(map=>map.id===config.id);
  const artwork=resolveMedia(state.assets,config.image,note.path);
  return records.flatMap(record=>record.markers||[]).filter(marker=>{
    if(!Array.isArray(marker.loc)||marker.loc.length!==2||!marker.loc.every(Number.isFinite))return false;
    if(!marker.layer)return true;
    let layer=marker.layer;try{layer=decodeURIComponent(layer)}catch{}
    layer=layer.replace(/^\[\[|\]\]$/g,'');
    return artwork?resolveMedia(state.assets,layer,note.path)?.url===artwork.url:mediaPath(layer)===mediaPath(config.image);
  }).map(marker=>{
    const target=String(marker.link||'').replace(/^\[\[|\]\]$/g,''),[path,label]=target.split('|');
    const clean=mediaPath(path.split('#')[0]).replace(/\.md$/i,'');
    const linked=state.notes.find(n=>mediaPath(n.path).replace(/\.md$/i,'')===clean)||state.notes.find(n=>n.title===clean.split('/').pop());
    return {id:'obsidian-'+marker.id,name:label||linked?.title||path||marker.description||'Location',
      kind:marker.type||'default',
      ...leafletPosition(config,dimensions,...marker.loc,marker.percent),noteId:linked?.id||'',description:marker.description||'',obsidian:true};
  });
}
export async function buildVaultAtlas(state,measureImage) {
  const result=state.maps.filter(map=>!map.sourceNoteId);
  for(const note of state.notes.filter(isMapNote)){
    const blocks=[];
    transformNoteMedia(note.text,{image:()=>'',wikilink:()=>'',map:config=>{blocks.push(config);return ''}});
    if(!blocks.length)blocks.push({markers:[],image:null});
    for(let index=0;index<blocks.length;index++){
      const config=blocks[index],id='vault-'+note.id+'-'+index;
      const old=state.maps.find(map=>map.id===id)||state.maps.find(map=>map.sourcePath===note.path&&map.sourceIndex===index);
      const url=mediaURL(state.assets,config.image,note.path);
      let dimensions,error;
      try{if(!url)throw Error(config.image?'Map image not found: '+config.image:'Add a leaflet block with an image to this map note.');dimensions=old?.url===url&&old.width&&!old.error?old:await measureImage(url)}catch(e){error=e.message;dimensions=old||{width:1000,height:1000}}
      const sourcePins=config.markers.map((marker,i)=>{
        const target=marker.link.replace(/^\[\[|\]\]$/g,''),[path,label]=target.split('|');
        const linked=state.notes.find(n=>mediaPath(n.path).replace(/\.md$/i,'')===mediaPath(path).replace(/\.md$/i,''))||state.notes.find(n=>n.title===path);
        return {id:'source-'+i,name:label||linked?.title||path||'Location',kind:marker.kind||'default',...leafletPosition(config,dimensions,marker.lat,marker.lng),noteId:linked?.id||'',description:''};
      });
      const pins=sourcePins.flatMap(pin=>{
        const prior=old?.sourcePins?.find(p=>p.id===pin.id),edited=old?.pins?.find(p=>p.id===pin.id);
        if(prior&&!edited)return [];
        return [{...(prior&&JSON.stringify(prior)!==JSON.stringify(edited)?edited:pin)}];
      });
      pins.push(...savedLeafletPins(state,config,note,dimensions));
      pins.push(...(old?.pins||[]).filter(p=>!p.id.startsWith('source-')&&!p.id.startsWith('obsidian-')));
      result.push({...old,id,name:note.title+(blocks.length>1?' · '+(config.id||'Map '+(index+1)):''),
        sourceNoteId:note.id,sourcePath:note.path,sourceIndex:index,url,width:dimensions.width,height:dimensions.height,
        bounds:config.bounds||null,maxZoom:Math.min(20,Math.max(3,Number(config.maxZoom)||3)),pins,sourcePins,error});
    }
  }
  return result;
}
export function mediaPath(value) {
  let path=String(value||'').trim().replace(/^<|>$/g,'').replace(/\\/g,'/');
  try{path=decodeURIComponent(path)}catch{}
  const parts=[];
  for(const part of path.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part)}
  return parts.join('/');
}
export function resolveMedia(assets,target,base='') {
  const raw=String(target||'').split('|')[0],path=mediaPath(raw);
  const relative=mediaPath(base.split('/').slice(0,-1).join('/')+'/'+raw);
  return assets.find(a=>a.url===target)||
    assets.find(a=>mediaPath(a.path)===(raw.startsWith('.')?relative:path))||
    assets.find(a=>mediaPath(a.path)===relative)||
    assets.find(a=>mediaPath(a.path).split('/').pop()===path.split('/').pop());
}
export function mediaURL(assets,target,base='') {
  const found=resolveMedia(assets,target,base);
  if(found)return found.url;
  return /^https?:\/\//i.test(target||'')?target:null;
}
export function parseNoteMap(source) {
  const config={markers:[]};
  for(const line of source.split(/\r?\n/)){
    const match=line.match(/^\s*([\w]+):\s*(.*?)\s*$/);if(!match)continue;
    const [,key,value]=match;
    if(key==='marker'){
      const marker=value.match(/^([^,]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(?:,\s*(.*))?$/);
      if(marker&&Number.isFinite(+marker[2])&&Number.isFinite(+marker[3]))config.markers.push({kind:marker[1],lat:+marker[2],lng:+marker[3],link:marker[4]||''});
    }else config[key]=value.replace(/^(['"])(.*)\1$/,'$2');
  }
  config.image=config.image?.replace(/^!?(?:\[\[)(.*?)\]\]$/,'$1').replace(/^\[[^\]]*\]\((.*?)\)$/,'$1');
  config.height=Math.min(900,Math.max(200,parseInt(config.height)||500));
  if(config.bounds){try{const bounds=JSON.parse(config.bounds);config.bounds=Array.isArray(bounds)&&bounds.length===2&&bounds.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))?bounds:null}catch{config.bounds=null}}
  return config;
}
export function transformNoteMedia(text,{image,wikilink,map}) {
  // Keep examples and other code blocks literal. Leaflet is parsed as data only.
  return text.replace(/(^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?\n[\s\S]*?^[ \t]*\2[ \t]*(?=\r?$))|(`+)([^\n]*?)\4|!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]/gm,
    (whole,fence,ticks,language,inline,inlineText,embed,link)=>{
      if(fence){if(language.trim().toLowerCase()!=='leaflet')return whole;return map(parseNoteMap(fence.split(/\r?\n/).slice(1,-1).join('\n')))}
      if(inline)return whole;
      return embed!==undefined?image(embed):wikilink(link);
    });
}
