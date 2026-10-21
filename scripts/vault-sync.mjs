import {readdir, readFile, stat, lstat} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const types = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};

// Read only: Obsidian remains the source of truth. Never follow symlinks.
export function createVaultSync(root) {
  root = resolve(root);
  let cache = new Map(), pending;
  async function scan() {
    if (!(await lstat(root)).isDirectory()) throw Error('Obsidian Campaign folder is unavailable.');
    const notes = [], assets = [], files = new Map(), nextCache = new Map();
    async function walk(directory, prefix = '') {
      const entries = await readdir(directory, {withFileTypes:true});
      entries.sort((a,b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === '__MACOSX' || entry.isSymbolicLink()) continue;
        const path = prefix + entry.name, absolute = join(directory, entry.name);
        if (entry.isDirectory()) { await walk(absolute, path + '/'); continue; }
        if (!entry.isFile()) continue;
        const extension = path.match(/\.[^.]+$/)?.[0].toLowerCase();
        if (!['.md','.markdown',...Object.keys(types)].includes(extension)) continue;
        const info = await stat(absolute), previous = cache.get(path);
        let item;
        if (previous && previous.mtime === info.mtimeMs && previous.ctime === info.ctimeMs && previous.size === info.size) item = previous;
        else {
          if (info.size > 20 * 1024 * 1024) throw Error('Vault file exceeds 20 MB: ' + path);
          const bytes = await readFile(absolute);
          item = {mtime:info.mtimeMs, ctime:info.ctimeMs, size:info.size, digest:hash(bytes)};
          if (extension === '.md' || extension === '.markdown') item.text = bytes.toString('utf8');
        }
        nextCache.set(path, item);
        if (item.text !== undefined) notes.push({id:'local-' + hash(path).slice(0,24), path,
          title:item.text.match(/^#\s+(.+)$/m)?.[1] || entry.name.replace(/\.(md|markdown)$/i,''),
          text:item.text, tag:prefix.replace(/\/$/,'') || 'Note'});
        else {
          const url = '/local/file/' + path.split('/').map(encodeURIComponent).join('/') + '?v=' + item.digest;
          assets.push({path, url, type:types[extension]});files.set(path, {absolute, type:types[extension]});
        }
      }
    }
    await walk(root);
    // Read only this plugin's saved map data; other hidden vault data stays excluded.
    let leafletData={mapMarkers:[]};
    try{
      let directory=root;
      for(const segment of ['.obsidian','plugins','obsidian-leaflet-plugin','data.json']){
        directory=join(directory,segment);
        if((await lstat(directory)).isSymbolicLink())throw Error('Leaflet data cannot be a symbolic link.');
      }
      if((await stat(directory)).size>20*1024*1024)throw Error('Leaflet data exceeds 20 MB.');
      const saved=JSON.parse(await readFile(directory,'utf8'));
      leafletData={mapMarkers:Array.isArray(saved.mapMarkers)?saved.mapMarkers.map(map=>({id:map.id,markers:Array.isArray(map.markers)?map.markers:[]})):[],defaultMarker:saved.defaultMarker,markerIcons:Array.isArray(saved.markerIcons)?saved.markerIcons:[]};
    }catch(error){if(error.code!=='ENOENT')throw error}
    cache = nextCache;
    return {notes, assets, files, leafletData, revision:hash(JSON.stringify([[...cache].map(([path,item])=>[path,item.digest]),leafletData]))};
  }
  return {snapshot() {
    if (!pending) pending = scan().finally(()=>{pending = undefined});
    return pending;
  }};
}
