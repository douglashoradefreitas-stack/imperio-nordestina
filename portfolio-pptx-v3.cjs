'use strict';
// Dados locais de revisão: nenhuma instrução do manifesto é executada.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const manifest=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'portfolio-pptx-v3.json'),'utf8'));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(message,status=409)=>{const e=new Error(message);e.status=status;throw e};
function localPhoto(item,image){
 const m=manifest(),p=m.photoAdditions.find(p=>p.targetId===item?.id&&p.proposedRoute===image);
 if(!p||![m.importId,require('./portfolio-cultural-inicial.json').importId].includes(item.sourceImport))return null;
 return p;
}
function asset(route){return manifest().photoAdditions.find(p=>p.proposedRoute===route)||null;}
function approvedAsset(data,route,admin=false){
 const p=asset(route);if(!p)return false;
 if(admin)return true;
 const receipt=(data.imports||[]).find(r=>r.id===manifest().importId);
 return receipt?.imageAuthorizationReviewed===true&&receipt?.minorAuthorizationReviewed===true&&data.items.some(i=>i.id===p.targetId&&i.status==='Publicado'&&require('./portfolio-cultural.cjs').gallery(i).some(photo=>photo.image===route));
}
function integrity(m){
 if(sha(fs.readFileSync(path.join(__dirname,'portfolio-cultural-inicial.json')))!==m.baseline.seedSha256)fail('A base cultural mudou. Revise os deltas antes de importar.');
 const routes=new Set(),originals=new Set();
 for(const p of m.photoAdditions){
  const name='pptx-v3-'+p.sourceAssetOriginalHash.slice(0,20)+'.webp';
  if(!/^[a-f0-9]{64}$/.test(p.sourceAssetOriginalHash)||p.proposedRoute!=='/assets/portfolio/'+name||p.imagefile!=='assets/'+name||routes.has(p.proposedRoute)||originals.has(p.sourceAssetOriginalHash))fail('Lista de imagens da revisão inválida.');
  routes.add(p.proposedRoute);originals.add(p.sourceAssetOriginalHash);
  const file=path.join(__dirname,'public/assets/portfolio',name);let bytes;try{bytes=fs.readFileSync(file)}catch{fail('Imagem da revisão ausente. Nenhum registro foi alterado.');}
  if(bytes.length!==p.bytes||sha(bytes)!==p.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')fail('Imagem da revisão não confere com o manifesto. Nenhum registro foi alterado.');
 }
}
function importV3(data,review={}){
 const m=manifest(),receipt=(data.imports||[]).find(r=>r.id===m.importId);
 if(receipt)return {data,alreadyImported:true,receipt,added:0,textsAdded:0,photosAdded:0,pendingReview:receipt.pendingReview};
 if(review.confirm!==true||review.textReviewed!==true||review.imageAuthorizationReviewed!==true||review.minorAuthorizationReviewed!==true)fail('Confirme a revisão dos textos e a autorização de todas as imagens, inclusive as de menores.',400);
 if(!(data.imports||[]).some(r=>r.id===require('./portfolio-cultural-inicial.json').importId))fail('Importe primeiro a base cultural de 87 registros.');
 integrity(m);
 const next=structuredClone(data),known=new Set([...(data.seenSourceIds||[]),...data.items.map(i=>i.id)]),incoming=m.newItems.filter(i=>!known.has(i.id));
 if(data.items.length+incoming.length>100)fail('A revisão completa excederia 100 trabalhos. Nenhum registro foi alterado. Libere espaço antes de importar.');
 const now=new Date().toISOString(),pendingReview=[],ledger=[],changed=new Set();let textsAdded=0,photosAdded=0;
 const pending=(kind,id,key,reason,details={})=>{pendingReview.push({kind,id,deltaKey:key,reason,...details});ledger.push({deltaKey:key,status:'pending'});};
 for(const source of incoming){
  const {id,title,description,date,status,year,activity,sourceHash,stableKey,provenance,internalReview}=source;
  next.items.push({id,title,description,date,status,year,activity,sourceHash,stableKey,provenance,...(internalReview?{internalReview}:{}),photos:[],photo:'',clippingLinks:[],spotifyUrl:'',youtubeUrl:'',sourceImport:m.importId,version:1,updatedAt:null});
  ledger.push({deltaKey:'registro:'+id,status:'applied'});
 }
 for(const source of m.newItems.filter(i=>known.has(i.id))){if(!next.items.some(i=>i.id===source.id))pending('registro',source.id,'registro:'+source.id,'Registro excluído anteriormente; não recriado.');}
 const byId=new Map(next.items.map(i=>[i.id,i])),base=require('./portfolio-cultural-inicial.json'),originals=new Map(base.items.map(i=>[i.id,i]));
 for(const d of m.existingTextDeltas){
  const item=byId.get(d.id),original=originals.get(d.id);
  if(!item){pending('texto',d.id,d.deltaKey,'Registro ausente ou excluído; texto não aplicado.',{proposedText:d.publicationText});continue;}
  if(d.reviewRequired||m.conflicts.some(c=>c.id===d.id)){pending('texto',d.id,d.deltaKey,d.internalReview||'Texto com divergência na fonte; exige revisão individual.',{proposedText:d.publicationText});continue;}
  if(item.customEdits||item.sourceImport!==base.importId||item.sourceHash!==d.expectedSourceHash||!original||sha(item.description||'')!==d.expectedDescriptionSha256||item.title!==original.title||item.year!==original.year||item.activity!==original.activity){pending('texto',d.id,d.deltaKey,'Texto ou identificação personalizada; preservados.',{proposedText:d.publicationText});continue;}
  const addition=d.publicationText;
  if(!addition||item.description.includes(addition)){ledger.push({deltaKey:d.deltaKey,status:'alreadyPresent'});continue;}
  if((item.description+'\n\n'+addition).length>5000){pending('texto',d.id,d.deltaKey,'Acréscimo ultrapassaria 5000 caracteres.',{proposedText:addition});continue;}
  item.description+='\n\n'+addition;changed.add(item.id);textsAdded++;ledger.push({deltaKey:d.deltaKey,status:'applied',sourceHash:d.sourceHash});
 }
 const gallery=require('./portfolio-cultural.cjs').gallery;
 const allOriginals=new Set(next.items.flatMap(i=>gallery(i).map(p=>p.evidence?.sourceAssetOriginalHash).filter(Boolean)));
 const allHashes=new Set(next.items.flatMap(i=>gallery(i).map(p=>p.image.startsWith('data:')?sha(Buffer.from(p.image.split(',')[1]||'','base64')):asset(p.image)?.sha256).filter(Boolean)));
 for(const p of m.photoAdditions){
  const item=byId.get(p.targetId),key=p.deltaKey;
  if(!item){pending('foto',p.targetId,key,'Registro ausente ou excluído; foto não restaurada.');continue;}
  const photos=gallery(item),original=originals.get(item.id),isNew=incoming.some(i=>i.id===item.id);
  const sourceValid=item.sourceImport===base.importId||item.sourceImport===m.importId;
  const expected=original?.photo||'';
  const customized=!isNew&&(item.photoTouched||item.customEdits||photos.some(q=>q.image.startsWith('data:'))||(Array.isArray(item.photos)&&photos.length===0)||(expected&&!photos.some(q=>q.image===expected))||photos.some(q=>!([original?.photo,original?.legacyPhoto,original?.supersededPhoto].includes(q.image)||localPhoto(item,q.image))));
  if(!sourceValid||customized){pending('foto',p.targetId,key,'Galeria personalizada, removida ou sem vínculo de origem; preservada.');continue;}
  if(photos.some(q=>q.image===p.proposedRoute)||allHashes.has(p.sha256)||allOriginals.has(p.sourceAssetOriginalHash)){ledger.push({deltaKey:key,status:'alreadyPresent',sourceAssetOriginalHash:p.sourceAssetOriginalHash});continue;}
  if(photos.length>=10){pending('foto',p.targetId,key,'Galeria já contém 10 fotos; nenhuma foto removida.');continue;}
  photos.push({image:p.proposedRoute,evidence:{...p.evidence,sourceAssetOriginalHash:p.sourceAssetOriginalHash,sha256:p.sha256,deltaKey:key}});
  item.photos=photos;item.photo=photos[0]?.image||'';if(photos[0]?.evidence)item.photoEvidence=photos[0].evidence;
  allHashes.add(p.sha256);allOriginals.add(p.sourceAssetOriginalHash);photosAdded++;if(!isNew)changed.add(item.id);
  ledger.push({deltaKey:key,status:'applied',sourceAssetOriginalHash:p.sourceAssetOriginalHash,sha256:p.sha256});
 }
 for(const id of changed){const item=byId.get(id);item.version=(item.version||1)+1;item.updatedAt=now;}
 next.seenSourceIds=[...new Set([...(data.seenSourceIds||[]),...m.newItems.map(i=>i.id)])];
 const result={id:m.importId,sourceSha256:m.source.sourceSha256,added:incoming.length,textsAdded,photosAdded,importedAt:now,textReviewed:true,imageAuthorizationReviewed:true,minorAuthorizationReviewed:true,pendingReview,conflicts:m.conflicts,ledger};
 next.imports=[...(next.imports||[]),result];
 if(Buffer.byteLength(JSON.stringify(next))>16*1024*1024)fail('Coleção excederia 16 MiB. Nenhum registro foi alterado.',413);
 return {data:next,receipt:result,alreadyImported:false,added:incoming.length,textsAdded,photosAdded,pendingReview};
}
module.exports={manifest,importV3,localPhoto,asset,approvedAsset};
