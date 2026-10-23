// Standalone browser renderer for Zoom Map image-space data.
// Coordinates are pixels from the top-left; zoom is a scale multiplier.
export function zoomAround(view,point,nextScale){
 const ratio=nextScale/view.scale;
 return {scale:nextScale,tx:point.x-(point.x-view.tx)*ratio,ty:point.y-(point.y-view.ty)*ratio};
}
export function fitImage(width,height,viewportWidth,viewportHeight){
 const scale=Math.max(0.000001,Math.min(viewportWidth/width,viewportHeight/height));
 return {scale,tx:(viewportWidth-width*scale)/2,ty:(viewportHeight-height*scale)/2};
}
export function screenPoint(view,point){return {x:view.tx+point.x*view.scale,y:view.ty+point.y*view.scale}}
export class ZoomMapRenderer{
 constructor(container,options={}){
  this.container=container;this.options=options;this.view={scale:1,tx:0,ty:0};this.pointers=new Map();this.listeners=[];this.pins=[];this.markersVisible=true;this.destroyed=false;
  container.replaceChildren();container.classList.add('zm-viewport');container.tabIndex=0;container.setAttribute('aria-label',options.label||'Interactive map');
  const make=(tag,classes,parent)=>{const element=document.createElement(tag);element.className=classes;parent.appendChild(element);return element};
  this.scene=make('div','zm-scene',container);this.image=make('img','zm-image',this.scene);this.image.alt='';this.image.draggable=false;
  this.markerLayer=make('div','zm-markers',container);
  const controls=make('div','zm-controls',container);
  this.toggle=this.button(controls,'Hide markers',()=>this.setMarkersVisible(!this.markersVisible));this.toggle.setAttribute('aria-pressed','false');
  const zoom=make('div','zm-zoom',controls);this.button(zoom,'+',()=>this.zoomBy(1.25),'Zoom in');this.button(zoom,'−',()=>this.zoomBy(0.8),'Zoom out');
  this.back=this.button(container,'Back',()=>options.onBack?.());this.back.classList.add('zm-back');this.back.hidden=!options.onBack;
  this.listen(container,'wheel',event=>{if(this.data?.responsive)return;event.preventDefault();const point=this.relative(event);this.zoomAt(point,Math.exp(-event.deltaY*0.0015));},{passive:false});
  this.listen(container,'dblclick',event=>{if(event.target.closest('button')||this.data?.responsive)return;event.preventDefault();this.zoomAt(this.relative(event),event.shiftKey?0.5:2)});
  this.listen(container,'pointerdown',event=>this.pointerDown(event));
  this.listen(container,'pointermove',event=>this.pointerMove(event));
  for(const name of ['pointerup','pointercancel','lostpointercapture'])this.listen(container,name,event=>{this.pointers.delete(event.pointerId);this.gesture=null;container.classList.remove('zm-dragging')});
  this.listen(container,'keydown',event=>{
   if(event.target!==container||this.data?.responsive)return;
   if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();else return;
   if(event.key==='+'||event.key==='=')this.zoomBy(1.25);else if(event.key==='-')this.zoomBy(0.8);
   else{this.view.tx+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;this.view.ty+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;this.draw()}
  });
  this.listen(this.image,'error',()=>options.onError?.('Could not load the map image.'));
  if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.invalidateSize());this.observer.observe(container)}
 }
 button(parent,text,action,label=text){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.onclick=event=>{event.stopPropagation();action()};parent.appendChild(button);return button}
 listen(target,name,listener,options){target.addEventListener(name,listener,options);this.listeners.push(()=>target.removeEventListener(name,listener,options))}
 relative(event){const bounds=this.container.getBoundingClientRect();return {x:event.clientX-bounds.left,y:event.clientY-bounds.top}}
 pointerDown(event){
  if(event.button!==0||event.target.closest('button')||this.data?.responsive)return;
  this.container.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,this.relative(event));this.gesture=null;this.container.classList.add('zm-dragging');
 }
 pointerMove(event){
  if(!this.pointers.has(event.pointerId))return;
  const prior=[...this.pointers.values()];this.pointers.set(event.pointerId,this.relative(event));const next=[...this.pointers.values()];
  if(next.length===1){this.view.tx+=next[0].x-prior[0].x;this.view.ty+=next[0].y-prior[0].y}
  else if(next.length===2){
   const midpoint=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
   const distance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
   const oldCenter=midpoint(prior),newCenter=midpoint(next);const scale=this.clampScale(this.view.scale*distance(next)/Math.max(1,distance(prior)));
   this.view=zoomAround(this.view,oldCenter,scale);this.view.tx+=newCenter.x-oldCenter.x;this.view.ty+=newCenter.y-oldCenter.y;
  }
  this.draw();
 }
 clampScale(scale){return Math.max(this.minScale||0.000001,Math.min(this.maxScale||8,scale))}
 zoomAt(point,factor){if(!this.data||this.data.responsive)return;this.view=zoomAround(this.view,point,this.clampScale(this.view.scale*factor));this.draw()}
 zoomBy(factor){this.zoomAt({x:this.container.clientWidth/2,y:this.container.clientHeight/2},factor)}
 setMap(data,{preserve=false}={}){
  const previous=preserve&&this.data?this.getView():null;
  this.data=data;this.image.src=data.url;this.image.style.width=data.width+'px';this.image.style.height=data.height+'px';this.image.style.imageRendering=data.imageRendering||'auto';
  for(const overlay of this.scene.querySelectorAll('.zm-overlay'))overlay.remove();
  for(const overlay of data.overlays||[]){if(overlay.visible===false)continue;const img=document.createElement('img');img.className='zm-image zm-overlay';img.alt='';img.draggable=false;img.src=overlay.url;img.style.width=data.width+'px';img.style.height=data.height+'px';this.scene.appendChild(img)}
  const fit=fitImage(data.width,data.height,this.container.clientWidth||800,this.container.clientHeight||500);
  this.minScale=Math.min(Number(data.minZoom)||0.2,fit.scale);this.maxScale=Math.max(Number(data.maxZoom)||8,fit.scale);
  if(previous)this.setView(previous.center,previous.zoom);else this.view=fit;
  this.setPins(data.pins||[]);this.draw();
 }
 clear(){this.data=null;this.image.removeAttribute('src');this.markerLayer.replaceChildren();this.pins=[]}
 setPins(pins){
  this.pins=pins;this.markerLayer.replaceChildren();this.pinElements=[];
  for(const pin of pins){const button=this.button(this.markerLayer,'',()=>this.options.onPin?.(pin),pin.name||'Location');button.className='zm-marker';button.title=pin.description?pin.name+' — '+pin.description:pin.name;
   button.innerHTML=this.options.markerHTML?.(pin)||'<span class="zm-default-pin"></span>';
   if(this.options.onPinContext)button.oncontextmenu=event=>{event.preventDefault();this.options.onPinContext(pin)};
   this.pinElements.push({pin,element:button});
  }
  this.draw();
 }
 setMarkersVisible(visible){this.markersVisible=visible;this.markerLayer.hidden=!visible;this.toggle.textContent=visible?'Hide markers':'Show markers';this.toggle.setAttribute('aria-pressed',String(!visible))}
 setBackAvailable(available){this.back.hidden=!available}
 getCenter(){return {x:((this.container.clientWidth||800)/2-this.view.tx)/this.view.scale,y:((this.container.clientHeight||500)/2-this.view.ty)/this.view.scale}}
 getZoom(){return this.view.scale}
 getView(){return {center:this.getCenter(),zoom:this.getZoom()}}
 setView(center,scale){if(!center)return;const zoom=this.clampScale(scale||this.view.scale);this.view={scale:zoom,tx:(this.container.clientWidth||800)/2-center.x*zoom,ty:(this.container.clientHeight||500)/2-center.y*zoom};this.draw()}
 invalidateSize(){if(!this.data)return;const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height)return;
  if(this.data.responsive)this.view=fitImage(this.data.width,this.data.height,width,height);
  else if(this.lastSize){const center={x:(this.lastSize.width/2-this.view.tx)/this.view.scale,y:(this.lastSize.height/2-this.view.ty)/this.view.scale};this.view.tx=width/2-center.x*this.view.scale;this.view.ty=height/2-center.y*this.view.scale}
  this.draw();
 }
 draw(){
  if(!this.data||this.destroyed)return;
  const width=this.container.clientWidth||800,height=this.container.clientHeight||500;
  if(this.data.panClamp!==false){const w=this.data.width*this.view.scale,h=this.data.height*this.view.scale;this.view.tx=w<=width?(width-w)/2:Math.min(0,Math.max(width-w,this.view.tx));this.view.ty=h<=height?(height-h)/2:Math.min(0,Math.max(height-h,this.view.ty))}
  this.scene.style.transform=`translate(${this.view.tx}px,${this.view.ty}px) scale(${this.view.scale})`;
  for(const {pin,element} of this.pinElements||[]){const point=screenPoint(this.view,pin);element.style.left=point.x+'px';element.style.top=point.y+'px';element.hidden=(pin.minZoom!=null&&this.view.scale<pin.minZoom)||(pin.maxZoom!=null&&this.view.scale>pin.maxZoom)}
  this.lastSize={width,height};
 }
 remove(){this.destroyed=true;this.observer?.disconnect();for(const dispose of this.listeners)dispose();this.container.replaceChildren();this.container.classList.remove('zm-viewport')}
}
