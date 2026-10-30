// Zoom Map data adapter shared by the local site and regression tests.
export function isMapNote(note){const path=logicalPath(note.path);return /^locations\//i.test(path)&&hasZoomMap(note)}
export function hasZoomMap(note){return /^\s*(?:`{3,}|~{3,})zoom-?map\s*$/im.test(note.text||'')}
export function worldAtlasMap(maps){
 return maps.find(map=>/^locations\/world map\/world\.md$/i.test(logicalPath(map.sourcePath)))||
  maps.find(map=>/\/(?:world|world[ _-]*map)\.(?:md|markdown)$/i.test(logicalPath(map.sourcePath)))||
  maps.find(map=>/^(?:world|world[ _-]*map)$/i.test(map.name||''))||maps.find(map=>!map.error)||maps[0];
}
export function matchingMapNote(notes,map){
 if(!map?.sourcePath)return null;
 return notes.find(n=>isMapNote(n)&&mediaPath(n.path)===mediaPath(map.sourcePath))||null;
}
export function mediaPath(value){
 let path=String(value||'').trim().replace(/^<|>$/g,'').replace(/\\/g,'/');try{path=decodeURIComponent(path)}catch{}
 const parts=[];for(const part of path.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part)}return parts.join('/');
}
export function resolveMedia(assets,target,base=''){
 const raw=String(target||'').split('|')[0],path=mediaPath(raw),relative=mediaPath(base.split('/').slice(0,-1).join('/')+'/'+raw);
 return assets.find(a=>a.url===target)||assets.find(a=>mediaPath(a.path)===(raw.startsWith('.')?relative:path))||assets.find(a=>mediaPath(a.path)===relative)||assets.find(a=>mediaPath(a.path).split('/').pop()===path.split('/').pop());
}
export function mediaURL(assets,target,base=''){const found=resolveMedia(assets,target,base);return found?.url||(/^https?:\/\//i.test(target||'')?target:null)}
export function markerDefinition(state,type='pinRed'){
 const key=type.replace(/^zoom-/,''),icon=(state.zoomData?.icons||[]).find(i=>i.key===key);
 if(icon){let svg=icon.pathOrDataUrl||'';try{svg=decodeURIComponent(svg)}catch{}
  const color=icon.color||svg.match(/(?:fill|stroke)=["'](#[\da-f]{3,8})["']/i)?.[1]||'#d23c3c';
  return {type:icon.name||key,iconName:icon.pathOrDataUrl||'map-marker',color:/^#[\da-f]{3,8}$/i.test(color)?color:'#d23c3c',isImage:!!icon.pathOrDataUrl};
 }
 return {type:key,iconName:'map-marker',color:'#d23c3c',isImage:false};
}
function scalar(value){
 value=value.trim();if(value.startsWith('"')){try{return JSON.parse(value.match(/^"(?:\\.|[^"\\])*"/)?.[0]||value)}catch{return value.slice(1,-1)}}
 if(value.startsWith("'"))return value.slice(1,value.lastIndexOf("'")).replace(/''/g,"'");
 return value.replace(/\s+#.*$/,'').trim();
}
const imageTarget=value=>String(value||'').replace(/^!?\[\[(.*?)\]\]$/,'$1').replace(/^\[[^\]]*\]\((.*?)\)$/,'$1');
export function parseZoomMap(source){
 const config={format:'zoommap',imageBases:[],imageOverlays:[]};let list=null,current=null;
 for(const line of source.split(/\r?\n/)){
  if(/^\s*(?:#|$)/.test(line))continue;
  const header=line.match(/^\s*(imageBases|imageOverlays):\s*(?:#.*)?$/);if(header){list=header[1];current=null;continue}
  if(list&&/^\s*-\s*/.test(line)){
   const value=line.replace(/^\s*-\s*/,'');const first=value.match(/^(path|name|visible):\s*(.*)$/);current=first?{[first[1]]:scalar(first[2])}:{path:scalar(value)};config[list].push(current);continue;
  }
  const match=line.match(/^(\s*)([\w]+):\s*(.*?)\s*$/);if(!match)continue;
  if(list&&current&&match[1].length>0){current[match[2]]=scalar(match[3]);continue}
  list=null;current=null;config[match[2]==='markers'?'markerFile':match[2]]=scalar(match[3]);
 }
 config.image=imageTarget(config.image||config.imageBases[0]?.path);
 config.height=Math.min(1000,Math.max(200,parseInt(config.height)||500));
 config.minZoom=Math.max(0.000001,parseFloat(config.minZoom)||0.2);config.maxZoom=Math.max(config.minZoom,parseFloat(config.maxZoom)||8);
 config.responsive=config.responsive==='true';config.imageRendering=['auto','pixelated','crisp-edges'].includes(config.imageRendering)?config.imageRendering:'auto';
 return config;
}
export function transformNoteMedia(text,{image,wikilink,map}){
 return text.replace(/(^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?\n[\s\S]*?^[ \t]*\2[ \t]*(?=\r?$))|(`+)([^\n]*?)\4|!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]/gm,
  (whole,fence,ticks,language,inline,inlineText,embed,link)=>{
   if(fence){if(!['zoommap','zoom-map'].includes(language.trim().toLowerCase()))return whole;return map(parseZoomMap(fence.split(/\r?\n/).slice(1,-1).join('\n')))}
   if(inline)return whole;return embed!==undefined?image(embed):wikilink(link);
  });
}
export function zoomMapData(state,config,note){
 if(config.storage==='note'){
  const blocks=[...note.text.matchAll(/ZOOMMAP-DATA id=([^\r\n]+)\r?\n([\s\S]*?)\r?\n\/ZOOMMAP-DATA/g)];
  const block=blocks.find(b=>b[1].trim()===config.id)||(!config.id?blocks[0]:null);if(block){try{return JSON.parse(block[2])}catch{return null}}return null;
 }
 const asset=resolveMedia(state.assets,config.image,note.path),target=config.markerFile||((asset?.path||config.image)+'.markers.json');
 const relative=mediaPath(note.path.split('/').slice(0,-1).join('/')+'/'+target);
 return (state.zoomData?.files||[]).find(f=>f.path===mediaPath(target))||(state.zoomData?.files||[]).find(f=>f.path===relative)||null;
}
export function savedZoomPins(state,config,note,dimensions){
 const data=zoomMapData(state,config,note);if(!data)return [];
 return (data.markers||[]).filter(m=>Number.isFinite(m.x)&&Number.isFinite(m.y)&&!(data.layers||[]).some(l=>l.id===m.layer&&l.visible===false)).map(m=>{
  const [path,label]=String(m.link||'').replace(/^\[\[|\]\]$/g,'').split('|'),clean=mediaPath(path.split('#')[0]).replace(/\.(md|markdown)$/i,'');
  const linked=resolveVaultNote(state.notes,path);
  return {id:'zoom-'+m.id,name:label||linked?.title||path||m.tooltip||'Location',kind:m.iconKey||state.zoomData?.defaultIconKey||'pinRed',
   x:m.x*dimensions.width,y:m.y*dimensions.height,noteId:linked?.id||'',description:m.tooltip||'',minZoom:m.minZoom??null,maxZoom:m.maxZoom??null};
 });
}
export async function buildVaultAtlas(state,measureImage){
 const maps=[],markerStyleKey=JSON.stringify(state.zoomData?.icons||[]);
 for(const note of state.notes.filter(n=>isMapNote(n)&&hasZoomMap(n))){
  const blocks=[];transformNoteMedia(note.text,{image:()=>'',wikilink:()=>'',map:c=>{blocks.push(c);return ''}});
  for(let index=0;index<blocks.length;index++){
   const config=blocks[index],data=zoomMapData(state,config,note),id='vault-'+note.id+'-'+index;
   const active=data?.activeBase&&resolveMedia(state.assets,data.activeBase,note.path)?data.activeBase:config.image;
   const artwork=resolveMedia(state.assets,active,note.path);
   const url=mediaURL(state.assets,active,note.path),old=state.maps?.find(m=>m.id===id);let dimensions,error;
   try{if(!url)throw Error('Map image not found: '+config.image);dimensions=artwork?.width>0&&artwork?.height>0?artwork:old?.url===url&&old.width&&!old.error?old:await measureImage(url)}catch(e){error=e.message;dimensions={width:1000,height:1000}}
   const overlays=[...config.imageOverlays,...(data?.overlays||[])].map(o=>typeof o==='string'?{path:o}:o).filter(o=>o.visible!==false&&o.visible!=='false').map(o=>({url:mediaURL(state.assets,o.path,note.path),visible:true})).filter(o=>o.url);
   maps.push({id,name:note.title+(blocks.length>1?' · '+(config.id||'Map '+(index+1)):''),sourceNoteId:note.id,sourcePath:note.path,sourceIndex:index,
    format:'zoommap',markerStyleKey,url,width:dimensions.width,height:dimensions.height,minZoom:config.minZoom,maxZoom:config.maxZoom,imageRendering:config.imageRendering,responsive:config.responsive,
    panClamp:data?.panClamp!==false,overlays,pins:savedZoomPins(state,config,note,dimensions),error});
  }
 }
 return maps;
}

export function stripNoteComments(text){
 return text.replace(/(\x60{3,}[^\n]*\n[\s\S]*?\n\x60{3,}|~{3,}[^\n]*\n[\s\S]*?\n~{3,}|\x60+[^\x60\n]*\x60+)|%%[\s\S]*?%%/g,(match,code)=>code||'');
}
export function noteHeadingId(text){return 'note-section-'+String(text).replace(/<[^>]*>/g,'').replace(/[*_\x60]/g,'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'')}
export function configureNoteLayout(renderer,marked){
 const quote=renderer.blockquote;
 renderer.blockquote=function(token){
  const match=/^\[!(infobox|toc|quote|cite)(?:\|([^\]]*))?\][+-]?[^\S\n]*([^\n]*)(?:\n|$)/i.exec(token.text);
  if(!match)return quote.call(this,token);
  const body=marked.parse(token.text.slice(match[0].length),{renderer});
  if(match[1].toLowerCase()==='infobox')return '<aside class="note-infobox">'+body+'</aside>\n';
  if(/^(quote|cite)$/i.test(match[1])){
   const title=match[3].trim(),caption=title?(marked.parseInline?marked.parseInline(title,{renderer}):title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')):'';
   return '<figure class="note-quote"><blockquote>'+body+'</blockquote>'+(caption?'<figcaption>'+caption+'</figcaption>':'')+'</figure>\n';
  }
  return '<nav class="note-contents" aria-label="Contents"><strong>Contents</strong>'+body+'</nav>\n';
 };
 renderer.heading=function({tokens,depth,text}){if(depth===4&&isSessionLabel(text))return '';return '<h'+depth+' id="'+noteHeadingId(text)+'">'+this.parser.parseInline(tokens)+'</h'+depth+'>\n'};
 return renderer;
}

export function characterPortrait(note,assets){
 if(!/^characters\//i.test(logicalPath(note.path)))return null;
 const text=stripNoteComments(note.text||'').replace(/\x60{3,}[^\n]*\n[\s\S]*?\n\x60{3,}|~{3,}[^\n]*\n[\s\S]*?\n~{3,}|\x60+[^\x60\n]*\x60+/g,'');
 const image=/!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/.exec(text);
 return image?mediaURL(assets,(image[1]||image[2]).replace(/^<|>$/g,''),note.path):null;
}

export function noteURL(note,notes=[]){
 const stem=logicalPath(note.path).replace(/\.(md|markdown)$/i,'');
 const name=stem.split('/').pop();
 const duplicates=notes.filter(n=>logicalPath(n.path).replace(/\.(md|markdown)$/i,'').split('/').pop().toLowerCase()===name.toLowerCase());
 const reserved=['characters','encounters','factions','locations','sessions','templates'].includes(name.toLowerCase());
 return '/notes/'+(duplicates.length>1||reserved?stem:name).split('/').map(encodeURIComponent).join('/');
}
export function routeNote(notes,pathname){
 if(!pathname.startsWith('/notes/'))return null;
 let target;try{target=decodeURIComponent(pathname.slice(7)).replace(/\/$/,'')}catch{return null}
 return resolveVaultNote(notes,target);
}

export function buildNoteTree(notes,{statusColors=false}={}){
 const root={name:'',path:'',folders:[],notes:[]};
 for(const note of notes){
  const parts=mediaPath(note.path).split('/');parts.pop();let parent=root;
  for(const name of parts){let folder=parent.folders.find(f=>f.name===name);if(!folder){folder={name,path:[parent.path,name].filter(Boolean).join('/'),folders:[],notes:[]};parent.folders.push(folder)}parent=folder}
  parent.notes.push(note);
 }
 const sort=node=>{node.folders.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));node.notes.sort((a,b)=>(statusColors&&/^characters\//i.test(logicalPath(a.path))&&/^characters\//i.test(logicalPath(b.path))?characterStatusOrder(a)-characterStatusOrder(b):0)||mediaPath(a.path).split('/').pop().localeCompare(mediaPath(b.path).split('/').pop(),undefined,{numeric:true}));node.folders.forEach(sort)};
 sort(root);return root;
}

// Decorative emoji do not change a folder's role or a note's logical identity.
export function logicalPath(value){
 return mediaPath(value).normalize('NFC').split('/').map(part=>part.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu,'').replace(/\s+/g,' ').trim()).filter(Boolean).join('/');
}
export function resolveVaultNote(notes,target,base=''){
 const raw=mediaPath(String(target).split('|')[0].split('#')[0]).replace(/\.(md|markdown)$/i,'');
 const stem=n=>mediaPath(n.path).replace(/\.(md|markdown)$/i,'');
 const relative=mediaPath(mediaPath(base).split('/').slice(0,-1).join('/')+'/'+raw);
 const exact=notes.find(n=>stem(n)===raw)||notes.find(n=>stem(n)===relative);if(exact)return exact;
 const key=logicalPath(raw).toLowerCase(),relativeKey=logicalPath(relative).toLowerCase();
 const normalized=notes.filter(n=>[key,relativeKey].includes(logicalPath(stem(n)).toLowerCase()));
 if(normalized.length===1)return normalized[0];
 const name=key.split('/').pop();
 const matches=notes.filter(n=>logicalPath(stem(n)).split('/').pop().toLowerCase()===name||logicalPath(n.title).toLowerCase()===name);
 return matches.length===1?matches[0]:null;
}

export function displayNoteTitle(title){return String(title||'').replace(/^\s*\d+\.\s*/,'')}
export function notePreview(note,state){
 const session=sessionImage(note,state.assets);
 let artwork=characterPortrait(note,state.assets)||session?.url,isMap=false;
 const clean=transformNoteMedia(stripNoteComments(note.text||''),{
  image:()=>'',wikilink:value=>value.split('|').pop(),map:config=>{
   if(!isMap&&isMapNote(note)){
    const saved=zoomMapData(state,config,note),active=saved?.activeBase||config.image;
    artwork=mediaURL(state.assets,active,note.path)||mediaURL(state.assets,config.image,note.path);isMap=true;
   }
   return '';
  }
 });
 const excerpt=/^characters\//i.test(logicalPath(note.path))?characterOverview(note).description:/^sessions\//i.test(logicalPath(note.path))?sessionRecapExcerpt(clean):clean.replace(/^---[\s\S]*?---/,'').replace(/^\s*>.*$/gm,'').replace(/^#+.*$/gm,'').replace(/[#>*\x60\[\]!]/g,'').replace(/\n/g,' ').replace(note.title,'').trim();
 const asset=state.assets.find(a=>a.url===artwork);
 return {excerpt,artwork:isMap?artwork:asset?.thumbnailUrl||artwork,isMap,isSession:/^sessions\//i.test(logicalPath(note.path)),dead:isDeadCharacter(note),sepia:/^(missing|unknown)$/.test(characterStatus(note))};
}

export function characterStatus(note){
 if(!/^characters\//i.test(logicalPath(note.path)))return '';
 const text=stripNoteComments(note.text||'').replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,'');
 const table=text.match(/^[\s>]*\|\s*(?:\*\*)?Status(?:\*\*)?\s*\|\s*([^|\n]+)\|/im);
 const property=text.match(/^status\s*:\s*([^\r\n]+)$/im);
 const status=table?.[1]||property?.[1]||'';
 return status.replace(/[*_"']/g,'').trim().toLowerCase();
}

export function isDeadCharacter(note){return characterStatus(note)==='dead'}

// The player folder identifies PCs even when their template type is unfinished.
export function isLivingPlayerCharacter(note){
 const parts=logicalPath(note.path).split('/').map(displayNoteTitle);
 if(parts[0]?.toLowerCase()!=='characters')return false;
 const inPlayerFolder=parts.slice(1,-1).some(part=>/^player characters$/i.test(part));
 const explicitPC=/^[\s>]*\|\s*(?:\*\*)?Type(?:\*\*)?\s*\|\s*PC\s*\|/im.test(note.text||'')||/^type\s*:\s*["']?PC["']?\s*$/im.test(note.text||'');
 return (inPlayerFolder||explicitPC)&&!['dead','missing','unknown','deceased'].includes(characterStatus(note));
}

export function matchesNoteTitle(note,query){
 const key=String(query||'').trim().toLowerCase();
 const folders=logicalPath(note.path||'').split('/').slice(0,-1).map(displayNoteTitle);
 return [displayNoteTitle(note.title),...folders].some(title=>title.toLowerCase().includes(key));
}

export function characterOverview(note){
 const text=stripNoteComments(note.text||'').replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,'');
 const plain=value=>String(value||'').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[*_`]/g,'').replace(/\s+/g,' ').trim();
 const frontmatter=text.match(/^---\s*\n([\s\S]*?)\n---/);
 const field=labels=>{
  for(const label of labels){
   const row=text.match(new RegExp('^[ \t>]*\\|[ \t]*(?:\\*\\*)?'+label+'(?:\\*\\*)?[ \t]*\\|[ \t]*(.+)\\|[ \t]*$','im'));
   const property=frontmatter?.[1].match(new RegExp('^'+label+':[ \t]*(.+)$','im'));
   const value=plain(row?.[1]||property?.[1]).replace(/^["']|["']$/g,'');
   if(value&&!/^[-/?]+$/.test(value))return value;
  }
  return 'Not recorded';
 };
 const body=text.replace(/^---[\s\S]*?---/,'').replace(/^>.*$/gm,'').replace(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g,'');
 const section=body.match(/^#{1,6}\s+Description\s*\r?\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im)?.[1];
 const introduction=body.replace(/^# [^\n]*(?:\n|$)/m,'').split(/^#{1,6}\s/m)[0];
 let description=plain(section||introduction);
 if(!description||/^[-/?]+$/.test(description)||description.toLowerCase()===(displayNoteTitle(note.title)+' is .').toLowerCase())description='Description not yet recorded.';
 const lead=description.match(/^(.+?)\s+(is\b[\s\S]*)$/i);
 if(lead&&[displayNoteTitle(note.title),field(['Full name'])].some(name=>name.toLowerCase()===lead[1].toLowerCase()))description=lead[2];
 return {description,ancestry:field(['Ancestry']),className:field(['Class or role','Class']),level:field(['Level'])};
}

export function sessionImage(note,assets){
 if(!/^sessions\//i.test(logicalPath(note.path)))return null;
 const name=displayNoteTitle(logicalPath(note.path).split('/').pop().replace(/\.(md|markdown)$/i,''));
 const number=/^session[\s_-]*(\d+)(?:\b|[_-])/i.exec(name)?.[1];
 if(!number)return null;
 return assets.find(asset=>{
  const path=logicalPath(asset.path);
  if(!/^assets\/session images\//i.test(path))return false;
  const match=/^session[\s_-]*(\d+)[\s_-]*image\.(?:webp|png|jpe?g|gif)$/i.exec(path.split('/').pop());
  return match&&Number(match[1])===Number(number);
 })||null;
}

export function characterStatusOrder(note){
 const status=characterStatus(note);
 return status==='dead'||status==='deceased'?2:/^(missing|unknown)$/.test(status)?1:0;
}
export function sessionRecapExcerpt(text){
 const heading=/^(#{1,6})[ \t]+Recap[ \t]*\r?$/im.exec(text);
 if(!heading)return '';
 const rest=text.slice(heading.index+heading[0].length);
 const next=new RegExp('^#{1,'+heading[1].length+'}[ \\t]+','m').exec(rest);
 return rest.slice(0,next?next.index:undefined).replace(/!\[[^\]]*\]\([^)]+\)/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[#>*\x60_]/g,'').replace(/\s+/g,' ').trim();
}

export function isSessionLabel(text){
 return /^session\s+\d+(?:\s+part\s+\d+)?$/i.test(String(text).replace(/<[^>]*>/g,'').replace(/[*_\x60]/g,'').trim());
}
export function makeNoteSectionsCollapsible(container){
 const doc=container.ownerDocument;
 for(const heading of Array.from(container.children)){
  if(heading.tagName!=='H2'||heading.parentElement!==container)continue;
  const section=doc.createElement('details'),summary=doc.createElement('summary'),body=doc.createElement('div');
  section.className='note-section';section.open=true;body.className='note-section-body';
  container.insertBefore(section,heading);section.append(summary,body);summary.append(heading);
  while(section.nextSibling&&!/^(H1|H2)$/.test(section.nextSibling.nodeName))body.append(section.nextSibling);
 }
}
export function revealNoteSection(target){
 for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
}
