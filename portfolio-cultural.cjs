'use strict';
// Somente importação administrativa explícita. Nenhuma rede, credencial ou outra chave.
const fs=require('fs'),path=require('path');
module.exports=function importCultural(data){
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'portfolio-cultural-inicial.json'),'utf8'));
 const previous=(data.imports||[]).find(r=>r.id===source.importId);
 if(previous)return {data,added:0,alreadyImported:true,receipt:previous};
 const known=new Set([...(data.seenSourceIds||[]),...data.items.map(i=>i.id)]);
 const incoming=source.items.filter(i=>!known.has(i.id));
 if(data.items.length+incoming.length>100){const e=new Error('A importação completa excederia 100 trabalhos. Nenhum registro foi alterado. Libere espaço antes de importar.');e.status=409;throw e;}
 const receipt={id:source.importId,sourceSha256:source.sourceSha256,added:incoming.length,importedAt:new Date().toISOString()};
 return {data:{...data,items:[...data.items,...incoming.map(i=>({...i,version:1,updatedAt:null,sourceImport:source.importId}))],seenSourceIds:[...new Set([...(data.seenSourceIds||[]),...source.items.map(i=>i.id)])],imports:[...(data.imports||[]),receipt]},added:incoming.length,alreadyImported:false,receipt};
};
