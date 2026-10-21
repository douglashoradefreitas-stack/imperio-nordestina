'use strict';
// Importações administrativas explícitas; fotografias são opcionais.
const fs=require('fs'),path=require('path');
const source=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'portfolio-cultural-inicial.json'),'utf8'));
function importCultural(data){
 const s=source(),previous=(data.imports||[]).find(r=>r.id===s.importId);
 if(previous)return {data,added:0,alreadyImported:true,receipt:previous};
 const known=new Set([...(data.seenSourceIds||[]),...data.items.map(i=>i.id)]),incoming=s.items.filter(i=>!known.has(i.id));
 if(data.items.length+incoming.length>100){const e=new Error('A importação completa excederia 100 trabalhos. Nenhum registro foi alterado. Libere espaço antes de importar.');e.status=409;throw e;}
 const receipt={id:s.importId,sourceSha256:s.sourceSha256,added:incoming.length,importedAt:new Date().toISOString()};
 const items=incoming.map(i=>({...i,...(i.photoEvidence?{photoEvidence:{...i.photoEvidence,revision:s.evidenceImportId}}:{}),version:1,updatedAt:null,sourceImport:s.importId}));
 return {data:{...data,items:[...data.items,...items],seenSourceIds:[...new Set([...(data.seenSourceIds||[]),...s.items.map(i=>i.id)])],imports:[...(data.imports||[]),receipt]},added:incoming.length,alreadyImported:false,receipt};
}
function addImages(data){
 const s=source();
 if((data.imageImports||[]).some(r=>r.id===s.evidenceImportId))return {data,updated:0,skipped:0,alreadyImported:true};
 if(!(data.imports||[]).some(r=>r.id===s.importId)){const e=new Error('Importe o portfólio cultural antes de adicionar suas fotografias.');e.status=409;throw e;}
 const originals=new Map(s.items.map(i=>[i.id,i]));let updated=0,skipped=0;
 const items=data.items.map(item=>{const original=originals.get(item.id);if(!original||item.sourceImport!==s.importId)return item;
  if(item.photoTouched===true){skipped++;return item;}
  // Retira somente o substituto documental reconhecido da revisão anterior.
  if(!original.photo){if(original.supersededPhoto&&item.photo===original.supersededPhoto){const clean={...item,photo:'',version:item.version+1,updatedAt:new Date().toISOString()};delete clean.photoEvidence;delete clean.evidenceHash;updated++;return clean;}return item;}
  if(item.photo===original.photo&&item.photoEvidence)return item;
  if(item.photo&&item.photo!==original.legacyPhoto){skipped++;return item;}
  updated++;return {...item,photo:original.photo,photoEvidence:{...original.photoEvidence,revision:s.evidenceImportId},evidenceHash:original.evidenceHash,version:item.version+1,updatedAt:new Date().toISOString()};
 });
 const receipt={id:s.evidenceImportId,updated,skipped,importedAt:new Date().toISOString()};
 return {data:{...data,items,imageImports:[...(data.imageImports||[]),receipt]},updated,skipped,alreadyImported:false};
}
module.exports=importCultural;module.exports.addImages=addImages;
