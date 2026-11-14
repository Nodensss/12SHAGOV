const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),out=path.join(base,'www/vendor');
for(const [source,target] of [['pdfjs-dist/legacy/build/pdf.min.mjs','pdfjs/pdf.mjs'],['pdfjs-dist/legacy/build/pdf.worker.min.mjs','pdfjs/pdf.worker.mjs'],['pdfjs-dist/LICENSE','pdfjs/LICENSE'],['fflate/umd/index.js','fflate.js'],['fflate/LICENSE','fflate-LICENSE']]){
 const dest=path.join(out,target);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(base,'node_modules',source),dest);
}
console.log('Offline PDF/EPUB readers bundled');
