import {test} from 'node:test';import assert from 'node:assert/strict';
import {ZoomMapRenderer,zoomAround,fitImage,screenPoint} from '../worker/zoom-map-renderer.js';
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.events=new Map();this.clientWidth=800;this.clientHeight=500;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
 appendChild(child){child.parent=this;this.children.push(child);return child}replaceChildren(){this.children=[]}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return k==='src'?this.src:this.attrs[k]}removeAttribute(k){delete this.attrs[k]}
 addEventListener(k,f){if(!this.events.has(k))this.events.set(k,new Set());this.events.get(k).add(f)}removeEventListener(k,f){this.events.get(k)?.delete(f)}
 emit(k,event){for(const fn of this.events.get(k)||[])fn({...event,target:event.target||this,preventDefault(){},stopPropagation(){}})}
 closest(selector){let node=this;while(node){if(selector==='button'&&node.tagName==='button')return node;node=node.parent}return null}
 querySelectorAll(selector){return this.children.filter(c=>(c.className||'').split(' ').includes(selector.slice(1)))}remove(){this.parent.children=this.parent.children.filter(c=>c!==this)}
 getBoundingClientRect(){return {left:0,top:0}}setPointerCapture(){}
}
function setup(options={}){globalThis.document={createElement:tag=>new Element(tag)};const container=new Element();const renderer=new ZoomMapRenderer(container,options);renderer.setMap({width:1600,height:1000,url:'map.webp',pins:[{id:'guild',name:'Guild',x:400,y:300}],minZoom:0.2,maxZoom:8,panClamp:false});return {container,renderer}}
const click=button=>button.onclick({stopPropagation(){}});
test('fit and pointer-anchored zoom preserve image-space coordinates',()=>{
 const fit=fitImage(1600,1000,800,500);assert.deepEqual(fit,{scale:0.5,tx:0,ty:0});
 const point={x:250,y:200},view=zoomAround(fit,point,1),world={x:point.x/0.5,y:point.y/0.5};assert.deepEqual(screenPoint(view,world),point);
});
test('renderer positions native markers, follows links and hides markers without hiding the image',()=>{
 let selected,back=0;const {renderer:r}=setup({onPin:p=>{selected=p.id},onBack:()=>back++,markerHTML:()=>'<span>icon</span>'});
 const pin=r.pinElements[0].element;assert.equal(pin.style.left,'200px');assert.equal(pin.style.top,'150px');click(pin);assert.equal(selected,'guild');
 click(r.toggle);assert.equal(r.markerLayer.hidden,true);assert.equal(r.toggle.textContent,'Show markers');assert.equal(r.image.src,'map.webp');
 r.setPins([{id:'new',name:'New',x:400,y:300}]);assert.equal(r.markerLayer.hidden,true);click(r.toggle);assert.equal(r.markerLayer.hidden,false);
 assert(r.back.classList);click(r.back);assert.equal(back,1);r.setBackAvailable(false);assert.equal(r.back.hidden,true);r.remove();
});
test('wheel zoom, pointer dragging and touch pinch use a single image transform',()=>{
 const {renderer:r,container}=setup();container.emit('wheel',{deltaY:-200,clientX:400,clientY:250});assert(r.view.scale>0.5);
 const before={...r.view};container.emit('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});container.emit('pointermove',{pointerId:1,clientX:140,clientY:120});assert.equal(r.view.tx,before.tx+40);assert.equal(r.view.ty,before.ty+20);
 container.emit('pointerup',{pointerId:1});container.emit('pointerdown',{button:0,pointerId:2,clientX:100,clientY:100});container.emit('pointerdown',{button:0,pointerId:3,clientX:200,clientY:100});const scale=r.view.scale;
 container.emit('pointermove',{pointerId:3,clientX:300,clientY:100});assert(Math.abs(r.view.scale-scale*2)<1e-10);r.remove();
});
test('view snapshots survive map switches and resize; disposed viewers remove listeners',()=>{
 const {renderer:r,container}=setup();r.setView({x:600,y:400},2);const snapshot=r.getView();assert.deepEqual(snapshot,{center:{x:600,y:400},zoom:2});
 container.clientWidth=1000;r.invalidateSize();assert.deepEqual(r.getCenter(),snapshot.center);assert.equal(r.getZoom(),2);
 r.setMap({width:1600,height:1000,url:'updated.webp',pins:[],maxZoom:8,panClamp:false},{preserve:true});assert.deepEqual(r.getCenter(),snapshot.center);
 r.remove();assert.equal(container.children.length,0);assert([...container.events.values()].every(listeners=>listeners.size===0));
});
test('responsive maps stay fitted and ignore interactive zoom; overlays stay in the image scene',()=>{
 const {renderer:r,container}=setup();r.setMap({width:1600,height:1000,url:'map.webp',responsive:true,overlays:[{url:'roads.png'},{url:'hidden.png',visible:false}],pins:[]});
 assert.equal(r.scene.children.length,2);const scale=r.getZoom();r.zoomBy(2);assert.equal(r.getZoom(),scale);container.clientWidth=400;r.invalidateSize();assert.equal(r.getZoom(),0.25);r.remove();
});

test('refresh reuses image and marker elements, but updates marker styles when settings change',()=>{
 let color='red';const {renderer:r}=setup({markerHTML:()=>color});
 const image=r.image,pin=r.pinElements[0].element;const descriptor={...r.data};
 r.setMap(descriptor,{preserve:true});assert.equal(r.image,image);assert.equal(r.pinElements[0].element,pin);
 color='blue';r.setMap({...descriptor,markerStyleKey:'updated'},{preserve:true});assert.notEqual(r.pinElements[0].element,pin);assert.equal(r.pinElements[0].element.innerHTML,'blue');r.remove();
});

test('loading screen follows the newest map decode and ignores stale map completion',async()=>{
 const {renderer:r,container}=setup();const pending=[];r.image.decode=()=>new Promise(resolve=>pending.push(resolve));
 r.setMap({...r.data,url:'b.webp',name:'Town'});const previous=r.loadPromise;
 assert.equal(r.loading.hidden,false);assert.equal(r.loadingText.textContent,'Loading Town…');assert.equal(container.attrs['aria-busy'],'true');
 r.setMap({...r.data},{preserve:true});assert.equal(pending.length,1);
 r.setMap({...r.data,url:'c.webp',name:'World'});const current=r.loadPromise;
 pending[0]();await previous;assert.equal(r.loading.hidden,false);assert.equal(r.loadingText.textContent,'Loading World…');
 pending[1]();await current;assert.equal(r.loading.hidden,true);assert.equal(container.attrs['aria-busy'],'false');r.remove();
});
test('loading screen waits for visible overlays as well as the map image',async()=>{
 const {renderer:r}=setup();r.image.decode=async()=>{};
 r.setMap({...r.data,url:'world.webp',overlays:[{url:'roads.webp'}]});assert.equal(r.loading.hidden,false);
 await Promise.resolve();assert.equal(r.loading.hidden,false);
 r.scene.querySelectorAll('.zm-overlay')[0].emit('load',{});await r.loadPromise;assert.equal(r.loading.hidden,true);r.remove();
});
test('failed image loads replace the spinner with an error and can be retried',async()=>{
 let errors=0;const {renderer:r}=setup({onError:()=>errors++});r.image.decode=async()=>{throw Error('network failure')};
 r.setMap({...r.data,url:'failed.webp'});await r.loadPromise;assert.equal(r.loading.hidden,false);assert.equal(r.spinner.hidden,true);assert.match(r.loadingText.textContent,/Could not load/);assert.equal(errors,1);
 r.image.decode=async()=>{};r.setMap({...r.data});await r.loadPromise;assert.equal(r.loading.hidden,true);r.remove();
});
test('clearing a loading map cancels its visible state and ignores later completion',async()=>{
 const {renderer:r,container}=setup();let resolve;r.image.decode=()=>new Promise(done=>{resolve=done});
 r.setMap({...r.data,url:'slow.webp'});const pending=r.loadPromise;r.clear();assert.equal(r.loading.hidden,true);assert.equal(container.attrs['aria-busy'],'false');
 resolve();await pending;assert.equal(r.ready,false);assert.equal(r.data,null);r.remove();
});
