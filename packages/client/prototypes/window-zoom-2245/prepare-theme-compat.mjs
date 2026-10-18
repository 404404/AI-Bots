// THROWAWAY #2245. Generate a version-locked downstream package in a temporary Profile.
// The installed ASAR is opened read-only. Nothing is written to the installed DSH.
import {openSync,readSync,closeSync,readFileSync,writeFileSync,mkdirSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export function prepareThemeCompatibility(root,asar){
 const hash=data=>createHash('sha256').update(data).digest('hex');
 const fd=openSync(asar,'r');const preamble=Buffer.alloc(16);readSync(fd,preamble,0,16,0);
 const header=Buffer.alloc(preamble.readUInt32LE(12));readSync(fd,header,0,header.length,16);let tree=JSON.parse(header.toString());const offset=8+preamble.readUInt32LE(4);
 const packagePath='dsh/node_modules/@deepseek-ai/dsh-client-ui-theme';for(const part of packagePath.split('/'))tree=tree.files[part];
 const target=join(root,'theme-compat');if(existsSync(target))throw Error('Refuse existing compatibility directory');
 function extract(node,path){if(node.files){mkdirSync(path,{recursive:true});for(const [name,child] of Object.entries(node.files))extract(child,join(path,name));return;}if(node.unpacked||node.link)throw Error('Unsupported ASAR entry');const bytes=Buffer.alloc(node.size);readSync(fd,bytes,0,bytes.length,offset+Number(node.offset));writeFileSync(path,bytes);}
 try{extract(tree,target);}finally{closeSync(fd);}
 const clientPath=join(target,'lib/client.js'),before=readFileSync(clientPath,'utf8');
 if(hash(before)!=='52e08eb1b687d8c9d2f550b4e1f2094b2b6108b8c6ea05601cab5c2e22aa4bb3')throw Error('Unqualified DSH theme build: refusing adaptation');
 const needle='\t\t\t\tinstallFontSizeShortcuts(ctx, (delta) => {\n\t\t\t\t\tthis.adjustFontSizes(delta);\n\t\t\t\t});';
 if(before.split(needle).length!==2)throw Error('Expected exactly one font-shortcut installer');
 const after=before.replace(needle,'\t\t\t\t// THROWAWAY downstream composition: zoom owns +/-; Appearance settings remain.');writeFileSync(clientPath,after);
 // A filesystem symlink into ASAR is not a resolvable ESM package. Reuse the
 // canonical installed schema module directly, preserving its singleton identity.
 const hostPath=join(target,'lib/index.js'),hostBefore=readFileSync(hostPath,'utf8');
 if(hash(hostBefore)!=='1adf59906ab10e91765d96f3e42268b0b7669f921c4baf4021a3057894cf3000')throw Error('Unqualified theme Host artifact');
 const hostAfter=hostBefore.replace('"@deepseek-ai/schemastery"',JSON.stringify(pathToFileURL(join(asar,'dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs')).href));
 if(hostAfter===hostBefore)throw Error('Expected schema import');writeFileSync(hostPath,hostAfter);
 const profile=join(root,'home/profiles/desktop'),manifest=join(profile,'package.json'),data=JSON.parse(readFileSync(manifest));data.dependencies['@deepseek-ai/dsh-client-ui-theme']='link:'+target;writeFileSync(manifest,JSON.stringify(data,null,2));
 const link=join(profile,'node_modules/@deepseek-ai/dsh-client-ui-theme');mkdirSync(dirname(link),{recursive:true});symlinkSync(target,link);
 const provenance={version:'0.2.1-rc.2',clientBefore:hash(before),clientAfter:hash(after),hostBefore:hash(hostBefore),hostAfter:hash(hostAfter),edits:['One Client installer call removed in temporary copy','Host schema import resolved to canonical installed module'],installedFilesModified:false};writeFileSync(join(root,'compat-provenance.json'),JSON.stringify(provenance,null,2));return provenance;
}
