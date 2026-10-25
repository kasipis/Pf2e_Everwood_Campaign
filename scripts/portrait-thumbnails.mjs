
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const pending=new Map();
let queue=Promise.resolve();
export function portraitThumbnail(file,directory){
 const key=directory+'/'+file.digest;
 if(pending.has(key))return pending.get(key);
 const result=(async()=>{
  const path=join(directory,file.digest+'-320-v1.webp');
  try{return await readFile(path)}catch(error){if(error.code!=='ENOENT')throw error}
  // Bound image decoding memory when many uncached portraits are requested together.
  const job=queue.then(async()=>{
   const bytes=await sharp(await readFile(file.absolute),{limitInputPixels:100000000}).rotate().resize({width:320,height:400,fit:'inside',withoutEnlargement:true}).webp({quality:72,effort:3}).toBuffer();
   await mkdir(directory,{recursive:true});await writeFile(path,bytes);return bytes;
  });
  queue=job.catch(()=>{});return job;
 })().finally(()=>pending.delete(key));
 pending.set(key,result);return result;
}
