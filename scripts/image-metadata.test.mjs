import {test} from 'node:test';import assert from 'node:assert/strict';import {imageDimensions} from './image-metadata.mjs';
test('image dimensions are read from PNG, GIF, JPEG and WebP headers without decoding',()=>{
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(3500,16);png.writeUInt32BE(2000,20);assert.deepEqual(imageDimensions(png),{width:3500,height:2000});
 const gif=Buffer.alloc(10);gif.write('GIF89a');gif.writeUInt16LE(640,6);gif.writeUInt16LE(480,8);assert.deepEqual(imageDimensions(gif),{width:640,height:480});
 const jpeg=Buffer.from([255,216,255,192,0,11,8,1,224,2,128,1,1,17,0]);assert.deepEqual(imageDimensions(jpeg),{width:640,height:480});
 const webp=Buffer.alloc(30);webp.write('RIFF');webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUIntLE(3499,24,3);webp.writeUIntLE(1999,27,3);assert.deepEqual(imageDimensions(webp),{width:3500,height:2000});
 const lossless=Buffer.from(webp);lossless.write('VP8L',12);lossless[20]=47;lossless.writeUInt32LE((479<<14)|639,21);assert.deepEqual(imageDimensions(lossless),{width:640,height:480});
 assert.equal(imageDimensions(Buffer.from('not an image')),null);assert.equal(imageDimensions(Buffer.from([255,216,255])),null);
});
