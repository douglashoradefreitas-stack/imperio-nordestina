'use strict';
// Importações administrativas explícitas; fotografias são opcionais.
const fs=require('fs'),path=require('path');
const source=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'portfolio-cultural-inicial.json'),'utf8'));
// Galeria pública: metadados pertencem à imagem, nunca à posição da capa.
// Enquadramento opcional por foto: zoom 1-3 e posição 0-100 (percentuais de object-position).
// Nenhum byte da imagem é alterado; fotos sem framing mantêm o comportamento original.
function framingRead(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const zoom=value.zoom===undefined?1:value.zoom,x=value.x===undefined?50:value.x,y=value.y===undefined?50:value.y;
 if(typeof zoom!=='number'||!Number.isFinite(zoom)||zoom<1||zoom>3||typeof x!=='number'||!Number.isFinite(x)||x<0||x>100||typeof y!=='number'||!Number.isFinite(y)||y<0||y>100)return undefined;
 const out={zoom:Math.round(zoom*100)/100,x:Math.round(x*100)/100,y:Math.round(y*100)/100};
 return out.zoom===1&&out.x===50&&out.y===50?undefined:out;
}
function framing(value,fail){
 if(value===undefined||value===null)return undefined;
 if(typeof value!=='object'||Array.isArray(value))fail('Enquadramento inválido: informe zoom de 1 a 3 e posição de 0 a 100.');
 if(Object.keys(value).some(k=>!['zoom','x','y'].includes(k)))fail('Enquadramento inválido: use somente zoom, x e y.');
 const number=(key,min,max,fallback)=>{const v=value[key]===undefined?fallback:value[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Enquadramento inválido: '+key+' deve ser um número entre '+min+' e '+max+'.');return Math.round(v*100)/100};
 const out={zoom:number('zoom',1,3,1),x:number('x',0,100,50),y:number('y',0,100,50)};
 return out.zoom===1&&out.x===50&&out.y===50?undefined:out;
}
function gallery(item={}){
 item=item||{};
 const entries=Array.isArray(item.photos)?item.photos:(item.photo?[{image:item.photo,...(item.photoEvidence?{evidence:item.photoEvidence}:{})}]:[]);
 const seen=new Set();return entries.filter(p=>p&&typeof p.image==='string'&&p.image&&!seen.has(p.image)&&seen.add(p.image)).map(p=>{const f=framingRead(p.framing);return {image:p.image,...(p.evidence?{evidence:p.evidence}:{}),...(f?{framing:f}:{})}});
}
function galleryView(item){const photos=gallery(item),result={...item,clippingLinks:item.clippingLinks??[],spotifyUrl:item.spotifyUrl??'',photos,photo:photos[0]?.image||''};delete result.photoEvidence;if(photos[0]?.evidence)result.photoEvidence=photos[0].evidence;return result;}
function updateGallery(body,item,validate,fail){
 const previous=gallery(item),hasArray=Object.hasOwn(body,'photos');let input;
 if(Object.hasOwn(body,'photo')&&typeof body.photo!=='string')fail('photo deve ser texto.');
 if(hasArray){if(!Array.isArray(body.photos)||body.photos.length>10)fail('Informe uma galeria com até 10 fotos.');input=body.photos;}
 else if(!Object.hasOwn(body,'photo')||body.photo===(previous[0]?.image||''))input=previous;
 else {if(previous.length>1)fail('Este trabalho possui galeria. Atualize o painel antes de trocar ou remover a capa.',409);input=body.photo?[{image:body.photo}]:[];}
 const s=source(),original=item&&s.items.find(i=>i.id===item.id&&item.sourceImport===s.importId),allowed=new Set(original?[original.photo,original.legacyPhoto,original.supersededPhoto].filter(Boolean):[]),seen=new Set();
 const photos=input.map(entry=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['image','evidence','framing'].includes(k))||typeof entry.image!=='string'||!entry.image)fail('Cada foto deve conter image e apenas evidence e framing opcionais.');
  const image=entry.image,old=previous.find(p=>p.image===image);let evidence;
  if(image.startsWith('/')){const v3=require('./portfolio-pptx-v3.cjs').localPhoto(item,image);if(v3){if(!old)fail('Fotos da revisão só podem ser anexadas pela importação autorizada.');evidence=old.evidence;}else{if(!allowed.has(image)||(!old&&image!==original?.photo))fail('Imagem local disponível somente no registro importado de origem.');evidence=old?.evidence||(image===original.photo?{...original.photoEvidence,revision:s.evidenceImportId}:undefined);}}
  else validate(image);
  if(entry.evidence!==undefined&&!require('util').isDeepStrictEqual(entry.evidence,evidence))fail('A origem da foto é definida pelo servidor; uploads não recebem crédito do PDF.');
  const frame=framing(entry.framing,fail);
  if(seen.has(image))return null;seen.add(image);return {image,...(evidence?{evidence}:{}),...(frame?{framing:frame}:{})};
 }).filter(Boolean);
 if(hasArray&&Object.hasOwn(body,'photo')&&body.photo!==(photos[0]?.image||''))fail('photo deve corresponder à primeira foto da galeria.');
 const changed=JSON.stringify(previous.map(p=>[p.image,p.framing||null]))!==JSON.stringify(photos.map(p=>[p.image,p.framing||null]));
 return {photos,photo:photos[0]?.image||'',...(photos[0]?.evidence?{photoEvidence:photos[0].evidence}:{}),...(changed?{photoTouched:true}:{})};
}
// Validação exclusivamente sintática: nunca resolve DNS nem consulta URLs do administrador.
function externalUrl(value,fail){
 const invalid=()=>fail('Clipping: use uma URL HTTPS de site público, até 2000 caracteres, sem espaços, credenciais, IP, domínio local ou porta diferente de 443.');
 if(typeof value!=='string'||!value||value.length>2000||/[\s\p{Cc}\p{Cf}\\]/u.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|20|7f|5c)/i.test(value)||!/^https:\/\//i.test(value))invalid();
 let u;try{u=new URL(value)}catch{invalid()}
 const authority=value.match(/^https:\/\/([^/?#]+)/i)?.[1];
 if(!authority||!/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+(?::443)?$/.test(authority)||u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.length>253||require('net').isIP(u.hostname)||u.hostname.split('.').some(p=>p.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(p)))invalid();
 const host=u.hostname.toLowerCase();if(/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/.test(host)||/(?:^|\.)(?:example\.(?:com|net|org)|home\.arpa)$/.test(host))invalid();
 const parsed=require('tldts').parse(host,{allowPrivateDomains:true});if(!parsed.domain||!parsed.publicSuffix||(!parsed.isIcann&&!parsed.isPrivate))invalid();
 const canonical=u.href;if(canonical.length>2000)invalid();return canonical;
}
function spotifyUrl(value,fail){
 const invalid=()=>fail('Spotify: use https://open.spotify.com/ com album, track, artist, playlist, show ou episode e identificador de 22 letras/números.');
 if(value==='')return '';if(typeof value!=='string'||value.length>2000||/[\s\p{Cc}\p{Cf}\\]/u.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|20|7f|5c)/i.test(value)||!/^https:\/\/open\.spotify\.com\//.test(value))invalid();
 let u;try{u=new URL(value)}catch{invalid()}
 const rawPath=value.slice('https://open.spotify.com'.length).split(/[?#]/,1)[0];
 const m=rawPath.match(/^\/(?:intl-pt\/)?(album|track|artist|playlist|show|episode)\/([A-Za-z0-9]{22})$/);
 if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.username||u.password||u.port||!m)invalid();return 'https://open.spotify.com/'+m[1]+'/'+m[2];
}
function updateLinks(body,item,fail){
 let clippingLinks=item?.clippingLinks??[],spotify=item?.spotifyUrl??'';
 if(Object.hasOwn(body,'clippingLinks')){
  if(!Array.isArray(body.clippingLinks)||body.clippingLinks.length>10)fail('Clipping: informe até 10 links por trabalho.');
  const seen=new Set();clippingLinks=body.clippingLinks.map(p=>{
   if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['title','url'].includes(k))||typeof p.title!=='string'||p.title.length>150||!p.title.trim()||/[\p{Cc}\p{Cf}]/u.test(p.title))fail('Clipping: cada link exige título de até 150 caracteres e URL.');
   const url=externalUrl(p.url,fail),identity=new URL(url);identity.hash='';if(seen.has(identity.href))fail('Clipping: URL repetida. Remova o link duplicado (fragmentos não distinguem matérias).');seen.add(identity.href);return {title:p.title.trim(),url};
  });
 }
 if(Object.hasOwn(body,'spotifyUrl'))spotify=spotifyUrl(body.spotifyUrl,fail);
 return {clippingLinks,spotifyUrl:spotify};
}
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
  if(Array.isArray(item.photos)){
   if(item.photoTouched||!item.photos.length||gallery(item).some(p=>p.image.startsWith('data:'))){skipped++;return item;}
   let photos=gallery(item).filter(p=>p.image!==original.supersededPhoto&&p.image!==original.legacyPhoto);
   if(original.photo&&!photos.some(p=>p.image===original.photo)&&photos.length<10)photos.push({image:original.photo,evidence:{...original.photoEvidence,revision:s.evidenceImportId}});
   photos=photos.map(p=>p.image===original.photo?{image:p.image,evidence:p.evidence||{...original.photoEvidence,revision:s.evidenceImportId}}:p);
   if(JSON.stringify(photos)===JSON.stringify(item.photos))return item;
   updated++;return galleryView({...item,photos,version:item.version+1,updatedAt:new Date().toISOString()});
  }
  if(item.photoTouched===true||gallery(item).some(p=>p.image.startsWith('data:'))){skipped++;return item;}
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
module.exports.gallery=gallery;module.exports.galleryView=galleryView;module.exports.updateGallery=updateGallery;
module.exports.framing=framing;module.exports.framingRead=framingRead;
module.exports.updateLinks=updateLinks;module.exports.externalUrl=externalUrl;module.exports.spotifyUrl=spotifyUrl;
