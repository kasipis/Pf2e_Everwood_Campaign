// Read dimensions from image headers without downloading/decoding in the browser.
export function imageDimensions(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return valid(bytes.readUInt32BE(16),bytes.readUInt32BE(20));
 if(bytes.length>=10&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return valid(bytes.readUInt16LE(6),bytes.readUInt16LE(8));
 if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  const type=bytes.toString('ascii',12,16);
  if(type==='VP8X')return valid(bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1);
  if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return valid(bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383);
  if(type==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);return valid((bits&16383)+1,((bits>>>14)&16383)+1)}
 }
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
  let offset=2;
  while(offset+3<bytes.length){
   if(bytes[offset++]!==255)continue;while(bytes[offset]===255)offset++;
   const marker=bytes[offset++];if(marker===218||marker===217)break;
   if(marker===216||marker===1||(marker>=208&&marker<=215))continue;
   if(offset+2>bytes.length)break;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return valid(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));
   offset+=length;
  }
 }
 return null;
}
function valid(width,height){return width>0&&height>0?{width,height}:null}
