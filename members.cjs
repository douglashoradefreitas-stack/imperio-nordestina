'use strict';
// Extensão isolada: nunca lê/grava acesso ou conteudo e nunca serve arquivos de dados.
const crypto = require('crypto');
// Projeção editorial, sem modificar identificadores, URLs, fotos ou proveniência.
function displayText(value){
  if(typeof value!=='string')return value;
  const caps=(source,target)=>source===source.toUpperCase()?target.toUpperCase():source[0]===source[0].toUpperCase()?target[0].toUpperCase()+target.slice(1):target;
  return value.normalize('NFC').replace(/\b(nossas?|suas?|das?|nas?|pelas?|umas?|as?|essas?|estas?|aquelas?)\s+(tradiç(?:ão|ões))\b/giu,(all,pre,word)=>{
    const plural=/ões$/iu.test(word),base=pre.toLowerCase();const map={nossa:'nosso',nossas:'nossos',sua:'seu',suas:'seus',da:'do',das:'dos',na:'no',nas:'nos',pela:'pelo',pelas:'pelos',uma:'um',umas:'uns',a:'o',as:'os',essa:'esse',essas:'esses',esta:'este',estas:'estes',aquela:'aquele',aquelas:'aqueles'};
    return caps(pre,map[base]||base)+' '+caps(word,plural?'legados':'legado');
  }).replace(/\btradiç(?:ão|ões)\b/giu,w=>caps(w,/ões$/iu.test(w)?'legados':'legado'));
}
function displayProjection(value,key=''){
  if(key==='clippingLinks')return value;
  if(typeof value==='string')return key==='sourceNote'?displayText(value):/(?:hash|source|import|id|url|photo|image|logo|salt|csrf|token|password|email|phone|cpf|rg|pix|request|receipt)/i.test(key)?value:displayText(value);
  if(Array.isArray(value))return value.map(v=>displayProjection(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,displayProjection(v,k)]));
  return value;
}
function preservePresentation(raw,input){
  if(typeof input==='string'&&typeof raw==='string'&&input===displayText(raw))return raw;
  if(Array.isArray(input))return input.map((v,i)=>preservePresentation(raw?.[i],v));
  if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,preservePresentation(raw?.[k],v)]));
  return input;
}
const {promisify} = require('util');
const scrypt = promisify(crypto.scrypt);
const KEYS = Object.freeze({dancers:'members_cadastros_v1', meetings:'members_encontros_v1', orders:'members_pedidos_v1', board:'members_diretoria_v1', finance:'members_financeiro_v1', materials:'members_materiais_2027_v1', manualLinks:'members_links_pagamento_v1', contribution:'members_contribuicao_2027_v1'});
const DEFAULT_CONTRIBUTION={year:2027,totalCents:38500,maxInstallments:4,installmentBaseCents:[9625,9625,9625,9625],version:0,updatedAt:null};
function contributionValues(b){const totalCents=integer(b.totalCents,1,MAX_CENTS,'Total base'),maxInstallments=integer(b.maxInstallments,1,4,'Máximo de parcelas');if(!Array.isArray(b.installmentBaseCents)||b.installmentBaseCents.length!==maxInstallments)error('Informe um valor base por parcela da opção máxima.');const installmentBaseCents=b.installmentBaseCents.map(v=>integer(v,1,MAX_CENTS,'Valor base da parcela'));if(installmentBaseCents.reduce((s,v)=>s+v,0)!==totalCents)error('A soma das parcelas base deve ser igual ao total, sem acréscimo.');return {totalCents,maxInstallments,installmentBaseCents};}
const DEFAULT_MANUAL_URL='https://mpago.la/32gDjGQ';
const DEFAULT_REPORTED_CENTS=38500; // Informação expressa do usuário, não validada no provedor.
const MANUAL_NOTICE='Confira o valor e identifique sua parcela antes de pagar. A confirmação deste link é manual.';
function manualUrl(value){const s=text(value,2000);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.port||!['mpago.la','mercadopago.com.br','www.mercadopago.com.br','mercadopago.com','www.mercadopago.com'].includes(u.hostname)||/[\u0000-\u0020\u007f\\\\]/.test(s))error('Use somente um link HTTPS do Mercado Pago, sem credenciais ou portas.');return u.href;}catch(e){if(e.status)throw e;error('Link de pagamento inválido.');}}
// O provedor é opcional; sua configuração e credenciais ficam somente no servidor.
const METHODS = ['Cartão de crédito','Boleto'];
const PAYMENT_STATUSES = ['Pendente','Pago','Cancelado'];
const MAX_CENTS = 100000000;
function integer(v,min,max,label){if(!Number.isSafeInteger(v)||v<min||v>max)error(label+' inválido.');return v;}
function cardRate(v){if(v===null||v===undefined)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100||Math.abs(v*100-Math.round(v*100))>1e-8)error('Taxa deve ser nula ou percentual de 0 a 100, com até duas casas decimais.');return v;}
function estimate(base,method,rate){if(method==='Boleto')return {feeCents:0,totalCents:base};if(rate===null)return {feeCents:null,totalCents:null};const feeCents=Number((BigInt(base)*BigInt(Math.round(rate*100))+5000n)/10000n);return {feeCents,totalCents:base+feeCents};}
function financeView(plan,billing,checkoutAttempts=[]){const installments=plan.installments.map(i=>({...i,estimate:i.status==='Pendente'?estimate(i.baseCents,plan.method,plan.cardFeePercent):null}));const pending=installments.filter(i=>i.status==='Pendente');const unknown=pending.some(i=>i.estimate.totalCents===null);return {...plan,installments,summary:{pendingBaseCents:pending.reduce((s,i)=>s+i.baseCents,0),estimatedPendingCents:unknown?null:pending.reduce((s,i)=>s+i.estimate.totalCents,0),paidCents:installments.filter(i=>i.status==='Pago').reduce((s,i)=>s+i.payment.amountCents,0)},billing,checkoutAttempts};}
const GROUPS = [['diretoria','Diretoria 2027'],['artistico','Diretores artísticos'],['coreografos','Coreógrafos 2027'],['repertorio','Repertório musical 2027'],['atelie','Ateliê 2027']];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PHOTO = 512 * 1024;
// Carregamento restrito ao portfólio; demais módulos continuam independentes.
const portfolioGallery={galleryView:item=>require('./portfolio-cultural.cjs').galleryView(item),updateGallery:(...args)=>require('./portfolio-cultural.cjs').updateGallery(...args),updateLinks:(...args)=>require('./portfolio-cultural.cjs').updateLinks(...args)};
// Projeção somente de leitura: fontes/evidências continuam no armazenamento e no ADMIN.
const publicGallery=item=>{const {photoEvidence,...v}=portfolioGallery.galleryView(item);return {...v,photos:v.photos.map(p=>({image:p.image}))};};
function error(message, status=400) { const e = new Error(message); e.status = status; throw e; }
function object(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) error('Objeto inválido.'); return v; }
function fields(v, allowed) { object(v); if (Object.keys(v).some(k=>!allowed.includes(k))) error('Campo não permitido.'); }
function text(v, max, required=false) { if (typeof v!=='string' || v.length>max) error('Texto inválido ou acima do limite.'); v=v.trim(); if(required&&!v) error('Preencha os campos obrigatórios.'); return v; }
function youtubeUrl(value) {
  const raw=text(value,2000);if(!raw)return '';
  const invalid=()=>error('Link do YouTube inválido. Use HTTPS e um vídeo watch, shorts, live ou youtu.be com identificador de 11 caracteres, sem credenciais ou portas.');
  if(/[\u0000-\u0020\u007f\\]/.test(raw)||!/^https:\/\/(?:www\.youtube\.com|youtube\.com|m\.youtube\.com|youtu\.be)\//i.test(raw))invalid();
  let u;try{u=new URL(raw);}catch{invalid();}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.youtube.com','youtube.com','m.youtube.com','youtu.be'].includes(u.hostname))invalid();
  let id='';if(u.hostname==='youtu.be'){const m=u.pathname.match(/^\/([A-Za-z0-9_-]{11})$/);if(m)id=m[1];}
  else if(u.pathname==='/watch'){if(u.searchParams.getAll('v').length===1)id=u.searchParams.get('v');}
  else {const m=u.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})$/);if(m)id=m[1];}
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))invalid();
  return 'https://www.youtube.com/watch?v='+id;
}
function email(v) { v=text(v,180,true).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) error('E-mail inválido.'); return v; }
function phone(v) { v=text(v,30,true); if(!/^\+?[0-9 ()-]{8,30}$/.test(v)||v.replace(/\D/g,'').length<8||v.replace(/\D/g,'').length>15) error('Telefone inválido.'); return v; }
function cpf(v) { v=text(v,14,true); if(!/^\d{11}$/.test(v)&&!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v)) error('CPF inválido.'); v=v.replace(/\D/g,''); if(/^(\d)\1{10}$/.test(v)) error('CPF inválido.'); for(let n=9;n<=10;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(v[i])*(n+1-i);const d=(sum*10)%11;if(Number(v[n])!==(d===10?0:d))error('CPF inválido.');} return v; }
function meetingDate(v, closed=false) { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)) error('Data inválida. Use AAAA-MM-DD.'); const d=new Date(v+'T00:00:00.000Z'); if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v||v<'1900-01-01') error('Data inválida. Use uma data legítima a partir de 1900.'); if(closed&&v>new Date().toISOString().slice(0,10)) error('Não é possível encerrar encontro com data futura.'); return v; }
function date(v) { meetingDate(v); if(v>checkinDay(new Date())) error('Nascimento não pode ser futuro.'); return v; }
function age(v) { const today=checkinDay(new Date());return Number(today.slice(0,4))-Number(v.slice(0,4))-(today.slice(5)<v.slice(5)?1:0); }
function password(v) { if(typeof v!=='string'||v.length<6||v.length>256) error('Senha deve ter entre 6 e 256 caracteres.');return v; }
function photo(v, required=true, maxBytes=MAX_PHOTO, maxSide=800) {
  if(!required&&v==='')return '';
  if(typeof v!=='string'||v.length>Math.ceil(maxBytes/3)*4+40) error('Foto obrigatória: PNG, JPEG ou WebP, até '+(maxBytes===MAX_PHOTO?'512 KiB':'2 MiB')+' e '+maxSide+' pixels por lado.');
  const m=v.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)error('Foto deve ser PNG, JPEG ou WebP.');
  const b=Buffer.from(m[2],'base64');if(!b.length||b.length>maxBytes||b.toString('base64')!==m[2])error('Foto inválida ou acima de '+(maxBytes===MAX_PHOTO?'512 KiB':'2 MiB')+'.');let w=0,h=0;
  if(m[1]==='png') { if(b.length<33||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(8)!==13)error('PNG inválido.');w=b.readUInt32BE(16);h=b.readUInt32BE(20); }
  else if(m[1]==='jpeg') { if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)error('JPEG inválido.');let p=2;while(p+4<=b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const mark=b[p++];if(mark===217||mark===218)break;if(mark===1||(mark>=208&&mark<=215))continue;if(p+2>b.length)break;const len=b.readUInt16BE(p);if(len<2||p+len>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(mark)&&len>=8){h=b.readUInt16BE(p+3);w=b.readUInt16BE(p+5);break;}p+=len;} }
  else {if(b.length<25||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)+8!==b.length)error('WebP inválido.');const kind=b.toString('ascii',12,16);if(kind==='VP8X'&&b.length>=30){if(b[20]&2)error('Use foto estática.');w=1+b.readUIntLE(24,3);h=1+b.readUIntLE(27,3);}else if(kind==='VP8L'&&b[20]===47){w=1+((b[21]|b[22]<<8)&16383);h=1+(((b[22]>>6)|(b[23]<<2)|(b[24]<<10))&16383);}else if(kind==='VP8 '&&b.length>=30&&b[23]===157&&b[24]===1&&b[25]===42){w=b.readUInt16LE(26)&16383;h=b.readUInt16LE(28)&16383;} }
  if(!w||!h||w>maxSide||h>maxSide)error('Foto inválida: limite de '+maxSide+' pixels por lado.');return v;
}
function profilePhoto(v){return photo(v,true,2*1024*1024,1600);}
function guardian(v, minor) {if(v===null||v===undefined){if(minor)error('Menor precisa de responsável completo e consentimento.');return null;}fields(v,['name','cpf','phone','email','relationship','consent']);if(v.consent!==true)error('Consentimento do responsável obrigatório.');return {name:text(v.name,150,true),cpf:cpf(v.cpf),phone:phone(v.phone),email:email(v.email),relationship:text(v.relationship,80,true),consent:true};}
function profile(v,validatePhoto=photo) {object(v);if(typeof v.rgSameAsCpf!=='boolean')error('Informe se RG é igual ao CPF.');const birth=date(v.birth);const rg=text(v.rg??'',40,!v.rgSameAsCpf);return {name:text(v.name,150,true),birth,phone:phone(v.phone),city:text(v.city,150,true),email:email(v.email),cpf:cpf(v.cpf),rgSameAsCpf:v.rgSameAsCpf,rg,photo:validatePhoto(v.photo),experience:text(v.experience??'',2000),message:text(v.message??'',2000),guardian:guardian(v.guardian,age(birth)<18)};}
const secureEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
async function digest(value,salt) {return (await scrypt(value,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1})).toString('hex');}
async function credentials(value) {const salt=crypto.randomBytes(32).toString('hex');return {salt,hash:await digest(value,salt)};}
// O dia da confirmação é sempre calculado pelo servidor, nunca pelo navegador.
const checkinDay=value=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Araguaina',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);const get=k=>parts.find(p=>p.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;};
const codeHash=code=>crypto.createHash('sha256').update(code).digest('hex');
function checkinOpen(m,now=Date.now()){return !m.closed&&m.date===checkinDay(new Date(now))&&m.autoCheckin?.enabled===true&&Date.parse(m.autoCheckin.expiresAt)>now;}
function checkinView(m,now=Date.now()){const open=checkinOpen(m,now);return {selfCheckinOpen:open,requiresCode:m.autoCheckin?.requiresCode!==false,expiresAt:open?m.autoCheckin.expiresAt:null};}
function adminMeeting(m){const {autoCheckin,...rest}=m;return {...rest,autoCheckin:{enabled:checkinOpen(m),requiresCode:autoCheckin?.requiresCode!==false,expiresAt:autoCheckin?.expiresAt??null,openedAt:autoCheckin?.openedAt??null},...checkinView(m)};}
function revokeCheckin(m){m.autoCheckin={enabled:false,expiresAt:null};}
const canonical=v=>JSON.stringify(v); // Somente objetos normalizados, com ordem explícita de campos.
const publicProfile=d=>Object.fromEntries(['id','name','birth','phone','city','email','cpf','rg','rgSameAsCpf','photo','experience','message','guardian','joinedAt','status'].map(k=>[k,d[k]]));
function stats(dancerId,meetings) {const s={rehearsalsPresent:0,rehearsalsAbsent:0,rehearsalsPending:0,rehearsalPercent:null,performancesPresent:0,performancesAbsent:0,performancesPending:0};for(const m of meetings){const a=m.attendees.find(a=>a.dancerId===dancerId);if(!a)continue;const prefix=m.type==='Ensaio'?'rehearsals':'performances';if(a.status==='Pendente')s[prefix+'Pending']++;else if(m.closed)s[prefix+(a.status==='Presente'?'Present':'Absent')]++;}const count=s.rehearsalsPresent+s.rehearsalsAbsent;if(count)s.rehearsalPercent=s.rehearsalsPresent/count*100;return s;}
async function readBody(req, max=2*1024*1024) {let size=0,parts=[];for await(const b of req){size+=b.length;if(size<=max)parts.push(b);}if(size>max)error('Corpo acima do limite permitido.',413);try{return object(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){if(e.status)throw e;error('JSON inválido.');}}
module.exports=function createMembers({store,session:adminSession,permitted,getContent,send,secure=false,authorizeAdmin=null}) {
  const rawSend=send;send=(res,status,data,headers)=>rawSend(res,status,displayProjection(data),headers);
  const dancerSessions=new Map(),rates=new Map();let tail=Promise.resolve();
  // Uma fila para todas as leituras/mutações desta extensão no processo único.
  const serial=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
  const load=async(key,initial)=>await store.get(key)??structuredClone(initial);
  const boardPortfolioKey='members_diretoria_portfolios_v1',boardMetaKey='members_diretoria_meta_v1';
  const boardPortfolios=()=>load(boardPortfolioKey,{items:[],version:0});
  async function boardData(){const groups=await load(KEYS.board,board());let changed=false;const ids=new Set();for(const group of groups)for(const person of group.items){if(!UUID.test(person.id||'')||ids.has(person.id)){person.id=crypto.randomUUID();changed=true;}ids.add(person.id);}if(changed)await store.set(KEYS.board,groups);const meta=await load(boardMetaKey,{version:0});return {groups,version:meta.version};}
  const emptyBoardPortfolio=()=>({title:'',introduction:'',trajectory:'',photos:[],youtubeUrl:'',clippingLinks:[],spotifyUrl:''});
  const portfolioFilled=p=>!!(p.title||p.introduction||p.trajectory||p.photos.length||p.youtubeUrl||p.clippingLinks.length||p.spotifyUrl);
  async function publicBoard(){const data=await boardData(),portfolios=await boardPortfolios(),published=new Set(portfolios.items.filter(p=>p.published&&p.public&&portfolioFilled(p.public)).map(p=>p.memberId));return {...data,groups:data.groups.map(g=>({...g,items:g.items.map(p=>({id:p.id,name:p.name,role:p.role,description:p.description,photo:p.photo,hasPortfolio:published.has(p.id)}))}))};}
  const sharingKey='members_trajetorias_publicas_v1';
  const sharing=()=>load(sharingKey,{items:[]});
  const interactionKey=id=>'members_trajetoria_interacoes_v1_'+id;
  const interactions=id=>load(interactionKey(id),{likes:[],comments:[],rates:{}});
  function validBirth(d){try{return !!d&&!!date(d.birth);}catch{return false;}}
  function adult(d){return validBirth(d)&&age(d.birth)>=18;}
  // Vínculo interno: alterações no titular, nascimento ou responsável invalidam a conferência.
  const authorizationSource=d=>codeHash(JSON.stringify({name:d.name,birth:d.birth,cpf:d.cpf,rg:d.rg,rgSameAsCpf:d.rgSameAsCpf,guardian:d.guardian}));
  const authorized=(s,d)=>s?.authorization?.status==='approved'&&s.authorization.source===authorizationSource(d)&&s.authorization.link===true&&s.authorization.directory===true;
  function authorizationStatus(s,d){const a=s?.authorization;if(a?.status==='approved'&&!authorized(s,d))return 'invalidated';return a?.status||'none';}
  // Único critério de elegibilidade usado em página, API, interações, diretório e destaques.
  const visible=(s,d)=>s?.enabled===true&&UUID.test(s.publicId||'')&&d&&['Pendente','Aprovado'].includes(d.status)&&validBirth(d)&&(adult(d)||authorized(s,d));
  function getPublicProfileInfo(s,d){return visible(s,d)?{publicId:s.publicId,name:d.name,photo:d.photo}:null;}
  function privacyView(s,d){return {enabled:visible(s,d),requested:s?.enabled===true,directoryListed:s?.directoryListed===true,version:s?.version||0,publicId:visible(s,d)?s.publicId:null,canPublish:validBirth(d)&&(adult(d)||authorized(s,d)),canRequest:validBirth(d)&&!adult(d),authorizationStatus:authorizationStatus(s,d),notice:'Privada por padrão. Compartilhar por link e aparecer na página Trajetórias são escolhas separadas. Ao ativar a listagem, seu perfil também aparece na página Trajetórias do site. Ao reativar, as interações anteriores reaparecem.'};}
  async function socialView(s,d,viewer=null,isAdmin=false,page=1){
    const all=(await ds()).items,active=new Map(all.filter(a=>a.status!=='Inativo').map(a=>[a.id,a]));
    const data=await interactions(d.id),comments=data.comments.filter(c=>active.has(c.actorId));
    return {likes:data.likes.filter(id=>active.has(id)).length,liked:!!viewer&&data.likes.includes(viewer.id),totalComments:comments.length,page,pageSize:25,comments:comments.slice((page-1)*25,page*25).map(c=>({id:c.id,text:c.text,author:active.get(c.actorId).name,createdAt:c.createdAt,canDelete:!!isAdmin||!!viewer&&(viewer.id===c.actorId||viewer.id===d.id)}))};
  }
  function pageNumber(u){if([...u.searchParams.keys()].some(k=>k!=='page')||u.searchParams.getAll('page').length>1)error('Paginação inválida.');const p=u.searchParams.get('page')||'1';if(!/^[1-9]\d{0,3}$/.test(p))error('Paginação inválida.');return Number(p);}
  async function socialActor(req){const s=ownSession(req);if(!s)error('Entre como dançarino para interagir.',401);const d=(await ds()).items.find(d=>d.id===s.dancerId);if(!d||d.status==='Inativo'||s.passwordHash!==d.hash){revoke(s.dancerId);error('Sessão inválida.',401);}if(!permitted(req,s))error('Token do perfil inválido.',403);return d;}
  function writeOrigin(req){origin(req);if(req.headers['sec-fetch-site']==='cross-site')error('Origem não autorizada.',403);}
  const recoveryKey='members_recovery_v1';
  const unavailable='Recuperação por e-mail indisponível. Solicite à organização a redefinição.';
  const recoveryMessage='Se houver cadastro ativo para esse e-mail, enviaremos instruções de recuperação.';
  function mailConfig(){
    try{const raw=process.env.APP_BASE_URL||'',u=new URL(raw),port=Number(process.env.SMTP_PORT||465),host=process.env.SMTP_HOST||'',from=process.env.SMTP_FROM||'';
      if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!u.hostname.includes('.')||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||/\.(?:local|localhost|internal)$/i.test(u.hostname)||/[\s\\]/.test(raw)||!host||/[\s\r\n]/.test(host)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(from)||!Number.isInteger(port)||port<1||port>65535)return null;
      if(Boolean(process.env.SMTP_USER)!==Boolean(process.env.SMTP_PASS))return null;
      return {base:u.origin,from,options:{host,port,secure:process.env.SMTP_SECURE!=='false',requireTLS:process.env.SMTP_SECURE==='false',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{}),connectionTimeout:4000,greetingTimeout:4000,socketTimeout:6000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true}};
    }catch{return null;}
  }
  // Notificações da aprovação: e-mail (SMTP já configurado para recuperação), aviso no site e WhatsApp opcional.
  const waDigits=value=>{const digits=String(value||'').replace(/\D/g,'');if(digits.length<10||digits.length>13)return '';if(digits.length>11)return digits.startsWith('55')?digits:'';return '55'+digits;};
  const approvalEnvKey='members_aprovacao_envios_v1';
  const approvalEnv=()=>load(approvalEnvKey,{statuses:{}});
  const whatsappCloudConfig=()=>{const token=process.env.WHATSAPP_TOKEN||'',id=process.env.WHATSAPP_PHONE_NUMBER_ID||'';return token&&id?{token,id}:null;};
  const siteBase=()=>{try{return new URL(process.env.APP_BASE_URL||'').origin;}catch{return '';}};
  const welcomeText=(name,base)=>'Olá, '+name+'! Sua inscrição na Império Nordestina foi aprovada. Acesse o site para acompanhar ensaios, apresentações e avisos: '+base;
  const waUrl=(digits,message)=>digits?'https://wa.me/'+digits+'?text='+encodeURIComponent(message):null;
  async function sendWelcomeEmail(address,name){const config=mailConfig();if(!config)return {status:'nao_configurado'};try{const transport=require('nodemailer').createTransport(config.options);await transport.sendMail({from:config.from,to:address,subject:'Inscrição aprovada — Império Nordestina',text:welcomeText(name,config.base),disableFileAccess:true,disableUrlAccess:true});transport.close();return {status:'enviado'};}catch{return {status:'falhou',reason:'falha no envio do e-mail'};}}
  async function sendWhatsappCloud(to,message){const config=whatsappCloudConfig();if(!config)return null;try{const response=await fetch('https://graph.facebook.com/v21.0/'+encodeURIComponent(config.id)+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:message}}),signal:AbortSignal.timeout(8000)});if(!response.ok)return {status:'falhou',reason:'falha no envio automático'};return {status:'enviado'};}catch{return {status:'falhou',reason:'falha no envio automático'};}}
  async function recordApprovalStatus(id,record){const data=await approvalEnv();data.statuses[id]={...record,at:new Date().toISOString()};const entries=Object.entries(data.statuses);if(entries.length>5000)data.statuses=Object.fromEntries(entries.slice(-5000));await store.set(approvalEnvKey,data);}
  async function dispatchApproval(d){
    const notice={kind:'Inscrição',title:'Inscrição aprovada',date:'',location:'',description:'Sua inscrição foi aprovada. Acompanhe ensaios, apresentações e avisos na sua área.',href:'/perfil'};
    let created=0;try{const result=await createNotices('aprovacao:'+d.id,noticeHash({kind:notice.kind,title:notice.title}),notice,[d.id]);created=result.created;}catch{created=0;}
    let emailStatus;try{emailStatus=await sendWelcomeEmail(d.email,d.name);}catch{emailStatus={status:'falhou',reason:'falha no envio do e-mail'};}
    const digits=waDigits(d.phone);let whatsappStatus={status:'manual'};
    if(whatsappCloudConfig()&&digits){try{whatsappStatus=await sendWhatsappCloud(digits,welcomeText(d.name,siteBase()))||{status:'manual'};}catch{whatsappStatus={status:'falhou',reason:'falha no envio automático'};}}
    const record={email:emailStatus,whatsapp:whatsappStatus};
    try{await recordApprovalStatus(d.id,record);}catch{}
    return {record,created,whatsappUrl:waUrl(digits,welcomeText(d.name,siteBase()))};
  }
  // Grupo de dançarinos: link de convite definido apenas pela organização, nunca público.
  const groupKey='members_grupo_dancarinos_v1';
  function groupUrl(value){const s=text(value,2000);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname!=='chat.whatsapp.com'||u.pathname.length<2||u.search||u.hash||/[\u0000-\u0020\u007f\\]/.test(s))error('Use somente um link de convite HTTPS do grupo de dançarinos (chat.whatsapp.com).');return u.href;}catch(e){if(e.status)throw e;error('Link de convite do grupo inválido.');}}
  const groupConfig=async()=>await store.get(groupKey)??{url:'',version:0,updatedAt:null};
  async function recoveryLimit(req,address=''){
    const data=await load(recoveryKey,{rates:{}}),now=Date.now();data.rates??={};
    for(const[k,v]of Object.entries(data.rates))if(v.until<=now)delete data.rates[k];
    const entries=address?[['email:'+codeHash(address),5]]:[['ip:'+codeHash(req.socket.remoteAddress||'unknown'),20]];
    if(Object.keys(data.rates).length>10000)error('Muitas tentativas. Aguarde 15 minutos.',429);
    let blocked=false;for(const[k,max]of entries){const r=data.rates[k]??={count:0,until:now+15*60000};if(++r.count>max)blocked=true;}
    await store.set(recoveryKey,data);if(blocked)error('Muitas tentativas. Aguarde 15 minutos.',429);
  }
  const ds=()=>load(KEYS.dancers,{items:[],receipts:[]});const ms=()=>load(KEYS.meetings,[]);const os=()=>load(KEYS.orders,{items:[],receipts:[]});
  const MATERIAL_TYPES=['nao_definida','feminino','masculino'];
  const materialType=value=>MATERIAL_TYPES.includes(value)?value:'nao_definida';
  const materialDestinationsKey='members_materiais_destinacoes_2027_v1';
  const materialDestinations=()=>load(materialDestinationsKey,{items:[]});
  const materialDestination=(data,id)=>{const d=data.items.find(i=>i.dancerId===id);return {listType:materialType(d?.listType),version:d?.version||0};};
  const materialAllowed=(item,destination)=>destination.listType!=='nao_definida'&&item.audience===destination.listType;
  const materialAnswersKey=id=>'members_materiais_respostas_2027_v1_'+id;
  async function materialList(){
    const data=await load(KEYS.materials,{year:2027,items:[],version:0,updatedAt:null}),seen=new Set();let migrated=false;
    const items=data.items.map(i=>{if(typeof i.id==='string'&&UUID.test(i.id)&&!seen.has(i.id)){seen.add(i.id);if(i.audience===undefined){migrated=true;return {...i,audience:'nao_definida'};}return i;}migrated=true;const id=crypto.randomUUID();seen.add(id);return {...i,id,audience:materialType(i.audience)};});
    if(!migrated)return data;
    const clean={...data,items,version:data.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.materials,clean);return clean;
  }
  const materialAnswers=id=>load(materialAnswersKey(id),{responses:{}});
  function materialResponse(data,id){const r=data.responses?.[id];return r&&typeof r.hasMaterial==='boolean'?{hasMaterial:r.hasMaterial,updatedAt:r.updatedAt,version:r.version}:{hasMaterial:null,updatedAt:null,version:0};}
  async function ownMaterials(id){const list=await materialList(),answers=await materialAnswers(id),destination=materialDestination(await materialDestinations(),id);return {year:2027,listVersion:list.version,listType:destination.listType,assignmentVersion:destination.version,items:list.items.filter(i=>materialAllowed(i,destination)).map(i=>({...i,response:materialResponse(answers,i.id)}))};}
  const approvalVersion=d=>crypto.createHash('sha256').update(JSON.stringify(publicProfile(d))).digest('hex');
  const notificationKey=id=>'members_avisos_v1_'+id,noticeCatalogKey='members_avisos_eventos_v1';
  const noticeHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const meetingNotice=m=>({type:m.type,title:m.title,date:m.date,location:m.location||''});
  const eventNotice=e=>({title:String(e.title||''),date:String(e.date||''),location:String(e.location||''),description:String(e.description||'')});
  async function noticeCatalog(){
    const previous=await load(noticeCatalogKey,{items:[]}),byHash=new Map(previous.items.map(i=>[i.hash,i]));
    // Identidade baseada no conteúdo exato, nunca índice/nome. Reordenação conserva;
    // edição recebe nova referência e exige nova confirmação administrativa.
    const items=[...new Map((getContent()?.events||[]).map(eventNotice).map(e=>{const hash=noticeHash(e);return [hash,{id:byHash.get(hash)?.id||crypto.randomUUID(),hash,...e}]})).values()];
    if(JSON.stringify(previous.items)!==JSON.stringify(items))await store.set(noticeCatalogKey,{items});return items;
  }
  const noticeCutoff=()=>Date.now()-180*86400000;
  async function noticeInbox(id){const data=await load(notificationKey(id),{items:[],receipts:[]});return {items:data.items.filter(i=>Date.parse(i.createdAt)>=noticeCutoff()).slice(-200),receipts:(data.receipts||[]).filter(i=>Date.parse(i.at)>=noticeCutoff()).slice(-400)};}
  async function createNotices(sourceKey,hash,notice,recipients,force=false){
    let created=0;const now=new Date().toISOString();
    for(const dancerId of [...new Set(recipients)]){const box=await noticeInbox(dancerId),dedupe=sourceKey+':'+hash;
      if(!force&&box.receipts.some(i=>i.key===dedupe))continue;
      const updated=box.receipts.some(i=>i.sourceKey===sourceKey);
      box.items.push({id:crypto.randomUUID(),sourceKey,hash,...notice,updated,createdAt:now,readAt:null});box.receipts.push({key:dedupe,sourceKey,at:now});
      box.items=box.items.slice(-200);box.receipts=box.receipts.slice(-400);await store.set(notificationKey(dancerId),box);created++;
    }return {created,eligible:recipients.length,channel:'site',message:'Notificação criada no site para '+created+' cadastro(s). Não é envio ao celular, WhatsApp ou e-mail.'};
  }
  async function notifyMeeting(m,force=false){const active=new Set((await ds()).items.filter(d=>['Pendente','Aprovado'].includes(d.status)).map(d=>d.id)),notice=meetingNotice(m);return createNotices('encontro:'+m.id,noticeHash(notice),{kind:m.type,title:notice.title,date:notice.date,location:notice.location,description:'',href:'/perfil?aba=presencas'},m.attendees.filter(a=>active.has(a.dancerId)).map(a=>a.dancerId),force);}
  async function visibleNotices(id){
    const box=await noticeInbox(id),meetings=new Map((await ms()).map(m=>[m.id,m])),events=new Set((getContent()?.events||[]).map(e=>noticeHash(eventNotice(e))));
    const items=box.items.filter(n=>{if(n.sourceKey.startsWith('aprovacao:'))return true;if(n.sourceKey.startsWith('encontro:')){const m=meetings.get(n.sourceKey.slice(9));return !!m&&m.attendees.some(a=>a.dancerId===id)&&noticeHash(meetingNotice(m))===n.hash;}return n.sourceKey.startsWith('evento:')&&events.has(n.hash)}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    return {box,items};
  }
  const board=()=>GROUPS.map(([key,title])=>({key,title,items:[]}));
  const mp=require('./mercado-pago.cjs')({store,readBody,fields,send});
  async function manualConfig(){const saved=await store.get(KEYS.manualLinks);if(saved!==null&&saved!==undefined){if(saved.generalUrl===DEFAULT_MANUAL_URL&&!Object.hasOwn(saved,'reportedAmountCents')){const migrated={...saved,reportedAmountCents:DEFAULT_REPORTED_CENTS,reportedAmountSource:'usuario',version:saved.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.manualLinks,migrated);return migrated;}return saved;}const initial={generalUrl:DEFAULT_MANUAL_URL,reportedAmountCents:DEFAULT_REPORTED_CENTS,reportedAmountSource:'usuario',version:0,updatedAt:null};await store.set(KEYS.manualLinks,initial);return initial;}
  async function contributionConfig(){const saved=await store.get(KEYS.contribution);if(saved!==null&&saved!==undefined)return saved;const initial=structuredClone(DEFAULT_CONTRIBUTION);await store.set(KEYS.contribution,initial);return initial;}
  async function financialView(plan,data){const view=financeView(plan,mp.status(),mp.view(data,plan.dancerId)),config=await manualConfig();view.manualPayment={generalUrl:config.generalUrl,reportedAmountCents:config.reportedAmountCents??null,reportedAmountSource:config.reportedAmountSource??null,providerVerified:false,notice:MANUAL_NOTICE,confirmation:'manual'};view.contribution2027=await contributionConfig();for(const i of view.installments){const specific=i.manualPaymentUrl||'';i.manualLink={url:specific||config.generalUrl||'',kind:specific?'installment':'general',label:specific?'Abrir pagamento desta parcela':'Abrir link geral de pagamento',confirmation:'manual'};}return view;}
  const cookie=(id,age)=>`imperio_dancer=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
  function ownSession(req){const c=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('imperio_dancer='));const id=c?c.slice('imperio_dancer='.length):'';const s=dancerSessions.get(id);if(!s||s.expires<=Date.now()){dancerSessions.delete(id);return null;}return {id,...s};}
  function origin(req){if(!req.headers.origin)return;try{if(new URL(req.headers.origin).host===req.headers.host)return;}catch{}error('Origem não autorizada.',403);}
  function limit(req,kind){const now=Date.now();for(const[k,r]of rates)if(r.reset<=now)rates.delete(k);const key=kind+':'+(req.socket.remoteAddress||'desconhecido');let r=rates.get(key);if(!r){if(rates.size>=10000)error('Serviço ocupado. Aguarde.',429);r={count:0,reset:now+15*60*1000};rates.set(key,r);}if(++r.count>(kind==='login'?12:kind==='/api/patrocinadores/submissoes'?10:40))error('Muitas tentativas. Aguarde 15 minutos.',429);}
  function revoke(id,except){for(const[k,s]of dancerSessions)if(s.dancerId===id&&k!==except)dancerSessions.delete(k);}
  function unique(items,p,id){if(items.some(d=>d.id!==id&&(d.cpf===p.cpf||d.email===p.email)))error('CPF ou e-mail já cadastrado.',409);}
  async function receipt(receipts,requestId,payload){const prev=receipts.find(r=>r.requestId===requestId);if(!prev)return null;if(!secureEqual(await digest(canonical(payload),prev.salt),prev.hash))error('requestId já utilizado com outro conteúdo.',409);return prev.response;}
  const timer=setInterval(()=>{for(const[k,s]of dancerSessions)if(s.expires<=Date.now())dancerSessions.delete(k);for(const[k,r]of rates)if(r.reset<=Date.now())rates.delete(k);},60000);timer.unref();
  async function route(req,res,u){const p=u.pathname,method=req.method;const isAdmin=p.startsWith('/api/admin/');let admin=null,own=null,dancer=null;
    if(isAdmin){admin=adminSession(req);if(!admin){if((p.startsWith('/api/admin/trajetorias')||p==='/api/admin/controle-inscricoes'||p==='/api/admin/materiais-2027/acompanhamento'||p.startsWith('/api/admin/patrocinadores')||p.startsWith('/api/admin/portfolio'))&&ownSession(req))error(p==='/api/admin/controle-inscricoes'?'Controle de inscrições exclusivo do administrador.':'Recurso exclusivo do administrador.',403);error('Entre para acessar o painel.',401);}if(authorizeAdmin){await authorizeAdmin(req,p);admin=adminSession(req);}if(method!=='GET'&&!permitted(req,admin))error('Token administrativo inválido.',403);}
    if(p.startsWith('/api/dancarinos/')&&!['/api/dancarinos/cadastro','/api/dancarinos/entrar','/api/dancarinos/recuperacao','/api/dancarinos/recuperar-senha','/api/dancarinos/redefinir-senha'].includes(p)){own=ownSession(req);if(!own)error('Entre para acessar seu perfil.',401);dancer=(await ds()).items.find(d=>d.id===own.dancerId);if(!dancer||dancer.status==='Inativo'||(own.passwordHash&&own.passwordHash!==dancer.hash)){revoke(own.dancerId);error('Sessão inválida.',401);}if(method!=='GET'&&!permitted(req,own))error('Token do perfil inválido.',403);}
    if(p==='/api/dancarinos/recuperacao'){if(method!=='GET')error('Método não permitido.',405);return send(res,200,{enabled:!!mailConfig()});}
    if(['/api/dancarinos/recuperar-senha','/api/dancarinos/redefinir-senha'].includes(p)){
      if(method!=='POST')error('Método não permitido.',405);
      origin(req);if(req.headers['sec-fetch-site']==='cross-site')error('Origem não autorizada.',403);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      await recoveryLimit(req);const b=await readBody(req,4096);
      if(p.endsWith('/recuperar-senha')){
        fields(b,['email']);const address=email(b.email),config=mailConfig();if(!config)error(unavailable,503);
        // Mesmo custo criptográfico e resposta para e-mails existentes/inexistentes.
        await recoveryLimit({socket:{remoteAddress:'email-bucket'}},address);
        const data=await ds(),d=data.items.find(d=>d.email===address&&d.status!=='Inativo');
        const token=crypto.randomBytes(32).toString('hex'),hash=codeHash(token);
        if(d){d.recovery={hash,expiresAt:new Date(Date.now()+30*60000).toISOString(),passwordHash:d.hash,email:d.email};await store.set(KEYS.dancers,data);
          try{const transport=require('nodemailer').createTransport(config.options);await transport.sendMail({from:config.from,to:address,subject:'Recuperar senha — Império Nordestina',text:'Você solicitou a recuperação da sua senha. Abra o link em até 30 minutos:\n'+config.base+'/perfil?recuperar='+token+'\nSe não fez esta solicitação, ignore esta mensagem.',disableFileAccess:true,disableUrlAccess:true});transport.close();}catch{/* Sem diagnóstico com endereço, link ou segredo. Resposta não enumera contas. */}
        }
        return send(res,200,{message:recoveryMessage});
      }
      fields(b,['token','password']);const pass=password(b.password),valid=typeof b.token==='string'&&/^[a-f0-9]{64}$/.test(b.token),candidate=codeHash(valid?b.token:'invalid'),data=await ds();
      const d=data.items.find(d=>d.recovery&&secureEqual(candidate,d.recovery.hash));
      if(!valid||!d||d.status==='Inativo'||!Number.isFinite(Date.parse(d.recovery.expiresAt))||Date.parse(d.recovery.expiresAt)<=Date.now()||d.recovery.passwordHash!==d.hash||d.recovery.email!==d.email)error('Link inválido ou expirado. Solicite uma nova recuperação.');
      Object.assign(d,await credentials(pass));delete d.recovery;await store.set(KEYS.dancers,data);revoke(d.id);
      return send(res,200,{ok:true,message:'Senha redefinida. Entre novamente.'});
    }
    if(p==='/api/admin/destaques/perfis'){if(method!=='GET')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');return rawSend(res,200,{items:await eligibleHighlightProfiles()});}
    if(p==='/api/admin/participantes'){if(method!=='GET')error('Método não permitido.',405);const data=await ds();return send(res,200,{items:data.items.map(d=>({id:d.id,name:d.name,status:d.status}))});}
    if(p==='/api/dancarinos/interacoes-sessao'){if(method!=='GET')error('Método não permitido.',405);return rawSend(res,200,{csrf:own.csrf});}
    if(p==='/api/dancarinos/trajetoria/privacidade'){
      if(!['GET','PUT'].includes(method))error('Método não permitido.',405);if(u.search)error('Não envie identidade ou filtros.');
      const data=await sharing();let s=data.items.find(i=>i.ownerId===dancer.id);
      if(method==='GET')return rawSend(res,200,privacyView(s,dancer));
      writeOrigin(req);if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);fields(b,['enabled','directoryListed','version']);if(typeof b.enabled!=='boolean'||b.directoryListed!==undefined&&typeof b.directoryListed!=='boolean')error('Informe sua escolha de publicação e listagem.');integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');
      if(b.version!==(s?.version||0))error('Privacidade alterada. Atualize antes de salvar.',409);
      if(b.enabled&&!validBirth(dancer))error('Nascimento inválido. Solicite a correção à organização.');
      if(!s){if(data.items.length>=10000)error('Limite de compartilhamentos atingido.',409);s={ownerId:dancer.id,publicId:crypto.randomUUID(),enabled:false,directoryListed:false,version:0};data.items.push(s);}
      const now=new Date().toISOString();
      if(b.enabled&&!adult(dancer)&&!authorized(s,dancer)&&authorizationStatus(s,dancer)!=='pending'){
        limit(req,'solicitar-trajetoria:'+dancer.id);
        s.authorization={status:'pending',requestedAt:now,link:false,directory:false};
      }
      s.enabled=b.enabled;s.directoryListed=b.directoryListed??(s.directoryListed===true);s.version++;s.updatedAt=now;await store.set(sharingKey,data);return rawSend(res,200,privacyView(s,dancer));
    }
    if(p==='/trajetorias'||p==='/trajetorias/'){
      if(method!=='GET')error('Método não permitido.',405);
      return rawSend(res,200,require('fs').readFileSync(require('path').join(__dirname,'public','trajetorias.html'),'utf8'));
    }
    if(p==='/api/trajetorias'){
      if(method!=='GET')error('Método não permitido.',405);
      if([...u.searchParams.keys()].some(k=>!['page','q'].includes(k))||['page','q'].some(k=>u.searchParams.getAll(k).length>1))error('Busca inválida.');
      const page=pageNumber(new URL('http://localhost/?page='+encodeURIComponent(u.searchParams.get('page')||'1'))),q=text(u.searchParams.get('q')||'',150);
      const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
      const all=new Map((await ds()).items.map(d=>[d.id,d]));
      const items=(await sharing()).items.filter(s=>s.directoryListed===true).map(s=>getPublicProfileInfo(s,all.get(s.ownerId))).filter(i=>i&&normalize(i.name).includes(normalize(q))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.publicId.localeCompare(b.publicId));
      return rawSend(res,200,{total:items.length,page,pageSize:24,items:items.slice((page-1)*24,page*24)});
    }
    const authorizationMatch=p.match(/^\/api\/admin\/trajetorias\/autorizacoes(?:\/([^/]+))?$/);
    if(authorizationMatch){
      if(u.search&&authorizationMatch[1])error('Parâmetros não permitidos.');
      const settings=await sharing(),all=(await ds()).items,map=new Map(all.map(d=>[d.id,d]));
      const view=s=>({publicId:s.publicId,name:map.get(s.ownerId).name,requested:s.enabled===true,directoryListed:s.directoryListed===true,version:s.version,status:authorizationStatus(s,map.get(s.ownerId)),requestedAt:s.authorization?.requestedAt||null,reviewedAt:s.authorization?.reviewedAt||null,reviewedOn:s.authorization?.reviewedOn||null,note:s.authorization?.note||'',actor:s.authorization?.actor||null});
      if(!authorizationMatch[1]){
        if(method!=='GET')error('Método não permitido.',405);const page=pageNumber(u),items=settings.items.filter(s=>map.has(s.ownerId)&&!adult(map.get(s.ownerId))&&validBirth(map.get(s.ownerId)));
        return rawSend(res,200,{total:items.length,page,pageSize:25,items:items.slice((page-1)*25,page*25).map(view)});
      }
      if(method!=='PUT')error('Método não permitido.',405);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const s=settings.items.find(s=>s.publicId===authorizationMatch[1]),d=s?map.get(s.ownerId):null;
      if(!s||!d||!UUID.test(authorizationMatch[1]))error('Solicitação não encontrada.',404);
      const b=await readBody(req,8192);fields(b,['version','action','note','reviewedOn','confirmed','link','directory']);
      integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==s.version)error('Solicitação alterada. Atualize e confira novamente.',409);
      if(!['approve','revoke'].includes(b.action))error('Ação inválida.');
      const note=text(b.note,1000,true);if(note.length<10)error('Informe uma nota interna de conferência com 10 a 1.000 caracteres, sem documentos ou dados sensíveis.');
      const now=new Date().toISOString();let next={...s.authorization,status:'revoked',note,actor:admin.accountId,reviewedAt:now};
      if(b.action==='approve'){
        if(adult(d)||!validBirth(d)||d.status==='Inativo')error('Cadastro indisponível para esta autorização.',409);
        guardian(d.guardian,true);
        if(!s.authorization?.requestedAt)error('O titular precisa solicitar a publicação primeiro.',409);
        if(b.confirmed!==true||b.link!==true||b.directory!==true)error('Confirme a conferência externa específica de nome, fotos, trajetória por link e descoberta no diretório.');
        const reviewedOn=meetingDate(b.reviewedOn);if(reviewedOn>checkinDay(new Date()))error('Data de conferência não pode ser futura.');
        next={...next,status:'approved',reviewedOn,source:authorizationSource(d),link:true,directory:true};
      }else {s.enabled=false;next.link=false;next.directory=false;}
      s.authorization=next;s.version++;s.updatedAt=now;
      s.authorizationAudit??=[];s.authorizationAudit.push({...next,version:s.version});s.authorizationAudit=s.authorizationAudit.slice(-50);
      await store.set(sharingKey,settings);return rawSend(res,200,view(s));
    }
    const sharedPage=p.match(/^\/trajetorias\/([^/]+)\/?$/);
    if(sharedPage){if(method!=='GET')error('Método não permitido.',405);const s=(await sharing()).items.find(s=>s.publicId===sharedPage[1]),d=s?(await ds()).items.find(d=>d.id===s.ownerId):null;if(!UUID.test(sharedPage[1])||!visible(s,d))error('Trajetória indisponível.',404);return rawSend(res,200,require('fs').readFileSync(require('path').join(__dirname,'public','trajetoria.html'),'utf8'));}
    const publicMatch=p.match(/^\/api\/trajetorias\/([^/]+)(?:\/(curtida|comentarios)(?:\/([^/]+))?)?$/);
    const adminSocial=p.match(/^\/api\/admin\/trajetorias\/([^/]+)(?:\/(comentarios)(?:\/([^/]+))?)?$/);
    if(p==='/api/admin/trajetorias'){
      if(method!=='GET')error('Método não permitido.',405);const page=pageNumber(u),data=await sharing(),all=(await ds()).items,map=new Map(all.map(d=>[d.id,d]));const items=data.items.filter(s=>visible(s,map.get(s.ownerId)));
      return rawSend(res,200,{total:items.length,page,pageSize:25,items:items.slice((page-1)*25,page*25).map(s=>({publicId:s.publicId,name:map.get(s.ownerId).name,version:s.version}))});
    }
    if(publicMatch||adminSocial){
      const m=publicMatch||adminSocial,id=m[1];if(!UUID.test(id))error('Trajetória indisponível.',404);
      const settings=await sharing(),s=settings.items.find(i=>i.publicId===id),d=s?(await ds()).items.find(d=>d.id===s.ownerId):null;
      if(!visible(s,d))error('Trajetória indisponível.',404);
      const page=pageNumber(u),action=m[2],commentId=m[3];if(commentId&&!UUID.test(commentId))error('Comentário não encontrado.',404);
      if(method==='GET'){
        if(commentId||action&&action!=='comentarios')error('Rota não encontrada.',404);
        const session=ownSession(req),viewer=session?(await ds()).items.find(a=>a.id===session.dancerId&&a.status!=='Inativo'&&a.hash===session.passwordHash):null;
        const social=await socialView(s,d,viewer,!!adminSocial,page);
        if(action==='comentarios')return rawSend(res,200,social);
        const trajectory=await load('members_trajetoria_v1_'+d.id,{items:[],version:0});
        return rawSend(res,200,{name:d.name,photo:d.photo,privacyVersion:s.version,items:trajectory.items.map(i=>({year:i.year,group:i.group,title:i.title,description:i.description,photo:i.photo})),social});
      }
      writeOrigin(req);if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);
      if(adminSocial&&!action&&method==='PUT'){
        fields(b,['enabled','version']);if(b.enabled!==false)error('O administrador só pode despublicar.',403);if(b.version!==s.version)error('Privacidade alterada. Atualize.',409);s.enabled=false;s.version++;await store.set(sharingKey,settings);return rawSend(res,200,{ok:true});
      }
      const actor=adminSocial?null:await socialActor(req),data=await interactions(d.id);
      if(action==='curtida'&&method==='PUT'&&!commentId&&!adminSocial){
        fields(b,['liked','privacyVersion']);if(typeof b.liked!=='boolean')error('Curtida inválida.');if(b.privacyVersion!==s.version)error('Privacidade alterada. Atualize.',409);
        const set=new Set(data.likes);if(b.liked){if(set.size>=10000&&!set.has(actor.id))error('Limite de curtidas atingido.',409);set.add(actor.id);}else set.delete(actor.id);data.likes=[...set];await store.set(interactionKey(d.id),data);return rawSend(res,200,await socialView(s,d,actor));
      }
      if(action==='comentarios'&&method==='POST'&&!commentId&&!adminSocial){
        fields(b,['text','privacyVersion']);if(b.privacyVersion!==s.version)error('Privacidade alterada. Atualize.',409);const content=text(b.text,1000,true);if(data.comments.length>=200)error('Limite de 200 comentários atingido.',409);
        const now=Date.now();for(const [k,r]of Object.entries(data.rates))if(r.until<=now)delete data.rates[k];
        const actorRateKey='members_trajetoria_ritmo_v1_'+actor.id,rate=await load(actorRateKey,{count:0,until:0});if(rate.until<=now){rate.count=0;rate.until=now+10*60000;}if(rate.count>=5)error('Limite de 5 comentários em 10 minutos.',429);rate.count++;await store.set(actorRateKey,rate);
        data.comments.push({id:crypto.randomUUID(),actorId:actor.id,text:content,createdAt:new Date().toISOString()});if(Buffer.byteLength(JSON.stringify(data))>1024*1024)error('Limite das interações atingido.',413);await store.set(interactionKey(d.id),data);return rawSend(res,201,await socialView(s,d,actor));
      }
      if(action==='comentarios'&&method==='DELETE'&&commentId){
        fields(b,['privacyVersion']);if(b.privacyVersion!==s.version)error('Privacidade alterada. Atualize.',409);const comment=data.comments.find(c=>c.id===commentId);if(!comment)error('Comentário não encontrado.',404);if(!adminSocial&&actor.id!==comment.actorId&&actor.id!==d.id)error('Não é permitido excluir este comentário.',403);
        data.comments=data.comments.filter(c=>c.id!==commentId);await store.set(interactionKey(d.id),data);return rawSend(res,200,await socialView(s,d,actor,!!adminSocial,page));
      }
      error('Método não permitido.',405);
    }
    const trajectoryMatch=p.match(/^\/api\/dancarinos\/trajetoria(?:\/([^/]+))?$/);
    if(trajectoryMatch){
      const key='members_trajetoria_v1_'+dancer.id,data=await load(key,{items:[],version:0});
      const id=trajectoryMatch[1];if(id&&!UUID.test(id))error('Registro não encontrado.',404);
      if(method==='GET'&&!id)return send(res,200,data);
      if(!['POST','PUT','DELETE'].includes(method)||(method==='POST'&&id)||(method!=='POST'&&!id))error('Método não permitido.',405);
      origin(req);if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      const b=await readBody(req,768*1024);fields(b,method==='DELETE'?['version']:['version','year','group','title','description','photo']);
      integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');const item=id?data.items.find(i=>i.id===id):null;if(id&&!item)error('Registro não encontrado.',404);
      if(data.version!==b.version)error('Trajetória alterada em outra sessão. Atualize antes de salvar.',409);
      if(method==='DELETE')data.items=data.items.filter(i=>i.id!==id);
      else {
        if(method==='POST'&&data.items.length>=20)error('Limite de 20 fotos atingido. Exclua uma foto antes de adicionar.',409);
        const clean={year:integer(b.year,1900,new Date().getUTCFullYear(),'Ano'),group:text(b.group??'',150),title:text(b.title??'',150),description:text(b.description??'',1000),photo:photo(b.photo===undefined&&item?item.photo:b.photo),updatedAt:new Date().toISOString()};
        if(item)Object.assign(item,clean);else data.items.push({...clean,id:crypto.randomUUID()});
      }
      data.version++;if(Buffer.byteLength(JSON.stringify(data))>8*1024*1024)error('Limite privado de 8 MiB atingido. Reduza imagens ou exclua uma foto.',413);
      await store.set(key,data);return send(res,method==='POST'?201:200,data);
    }
    // Recursos editoriais isolados, sempre sob a fila comum e a autenticação acima.
    const sponsorKey='members_patrocinadores_v1',portfolioKey='members_portfolio_v1';
    const sponsorMatch=p.match(/^\/api\/admin\/patrocinadores\/([^/]+)$/),portfolioMatch=p.match(/^\/api\/admin\/portfolio\/([^/]+)$/);
    const editorial=p==='/api/patrocinadores'||p==='/api/patrocinadores/submissoes'||p==='/api/portfolio'||p==='/api/admin/patrocinadores'||p==='/api/admin/portfolio'||sponsorMatch||portfolioMatch;
    if(editorial){
      if(method!=='GET'&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      const initial={items:[]};
      const checkVersion=(b,item)=>{integer(b.version,1,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==item.version)error('Registro alterado em outra sessão. Recarregue antes de salvar.',409);};
      const aggregate=data=>{if(Buffer.byteLength(JSON.stringify(data))>16*1024*1024)error('Coleção excede 16 MiB. Remova registros ou reduza imagens.',413);};
      if(p==='/api/patrocinadores'){
        if(method!=='GET')error('Método não permitido.',405);
        const data=await load(sponsorKey,initial);return send(res,200,{items:data.items.filter(i=>i.status==='Aprovado').map(i=>({name:i.name,logo:i.logo}))});
      }
      if(p==='/api/patrocinadores/submissoes'){
        if(method!=='POST')error('Método não permitido.',405);
        const b=await readBody(req,768*1024);fields(b,['name','logo','requestId']);if(typeof b.requestId!=='string'||!UUID.test(b.requestId))error('requestId deve ser UUID.');
        const clean={name:text(b.name,150,true),logo:photo(b.logo)},fingerprint=crypto.createHash('sha256').update(canonical(clean)).digest('hex');
        const data=await load(sponsorKey,initial),previous=data.items.find(i=>i.requestId===b.requestId);
        if(previous){if(previous.fingerprint!==fingerprint)error('requestId já utilizado com outro conteúdo.',409);return send(res,201,{message:'Solicitação recebida. A publicação depende da aprovação do administrador.'});}
        if(data.items.length>=200)error('Limite de solicitações atingido. Contate a organização.',409);
        data.items.push({...clean,id:crypto.randomUUID(),requestId:b.requestId,fingerprint,status:'Pendente',version:1,createdAt:new Date().toISOString(),updatedAt:null});aggregate(data);await store.set(sponsorKey,data);
        return send(res,201,{message:'Solicitação recebida. A publicação depende da aprovação do administrador.'});
      }
      if(p==='/api/admin/patrocinadores'){
        if(method!=='GET')error('Método não permitido.',405);const data=await load(sponsorKey,initial);
        return send(res,200,{items:data.items.map(({requestId,fingerprint,...item})=>item)});
      }
      if(sponsorMatch){
        if(method!=='PUT')error('Método não permitido.',405);if(!UUID.test(sponsorMatch[1]))error('Identificador inválido.');
        const b=await readBody(req,4096);fields(b,['version','action']);const data=await load(sponsorKey,initial),item=data.items.find(i=>i.id===sponsorMatch[1]);if(!item)error('Solicitação não encontrada.',404);checkVersion(b,item);
        const transitions={aprovar:['Pendente','Despublicado'],rejeitar:['Pendente'],despublicar:['Aprovado']};if(typeof b.action!=='string'||!Object.hasOwn(transitions,b.action)||!transitions[b.action].includes(item.status))error('Ação incompatível com a situação atual.',409);
        item.status={aprovar:'Aprovado',rejeitar:'Rejeitado',despublicar:'Despublicado'}[b.action];item.version++;item.updatedAt=new Date().toISOString();aggregate(data);await store.set(sponsorKey,data);
        return send(res,200,{ok:true,status:item.status,version:item.version});
      }
      if(p==='/api/admin/portfolio/adicionar-novidades'){
        if(method!=='POST')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');const b=await readBody(req,2048);fields(b,['confirm','textReviewed','imageAuthorizationReviewed','minorAuthorizationReviewed']);
        const result=require('./portfolio-pptx-v3.cjs').importV3(await load(portfolioKey,initial),b);aggregate(result.data);if(!result.alreadyImported)await store.set(portfolioKey,result.data);
        return send(res,200,{ok:true,added:result.added,textsAdded:result.textsAdded,photosAdded:result.photosAdded,pendingReview:result.pendingReview,alreadyImported:result.alreadyImported});
      }
      if(p==='/api/admin/portfolio/adicionar-imagens'){
        if(method!=='POST')error('Método não permitido.',405);const b=await readBody(req,1024);fields(b,['confirm']);if(b.confirm!==true)error('Confirme a inclusão das imagens.');
        const result=require('./portfolio-cultural.cjs').addImages(await load(portfolioKey,initial));aggregate(result.data);if(!result.alreadyImported)await store.set(portfolioKey,result.data);
        return send(res,200,{ok:true,updated:result.updated,skipped:result.skipped,alreadyImported:result.alreadyImported});
      }
      if(p==='/api/admin/portfolio/importar-cultural'){
        if(method!=='POST')error('Método não permitido.',405);const b=await readBody(req,1024);fields(b,['confirm']);if(b.confirm!==true)error('Confirme a importação.');
        const result=require('./portfolio-cultural.cjs')(await load(portfolioKey,initial));aggregate(result.data);if(!result.alreadyImported)await store.set(portfolioKey,result.data);
        return send(res,200,{ok:true,added:result.added,alreadyImported:result.alreadyImported});
      }
      if(p==='/api/portfolio'){
        if(method!=='GET')error('Método não permitido.',405);const data=await load(portfolioKey,initial);
        return send(res,200,{items:data.items.filter(i=>i.status==='Publicado').map(publicGallery).map(({title,description,date,photo,photos,clippingLinks,spotifyUrl,youtubeUrl:video='',year,activity})=>({title,description,date,photo,photos,clippingLinks,spotifyUrl,youtubeUrl:youtubeUrl(video),...(year!==undefined?{year}:{}),...(activity!==undefined?{activity}:{})}))});
      }
      if(p==='/api/admin/portfolio'&&method==='GET'){const data=await load(portfolioKey,initial);return send(res,200,{...data,items:data.items.map(portfolioGallery.galleryView)});}
      if((p==='/api/admin/portfolio'&&method==='POST')||portfolioMatch){
        if(portfolioMatch&&!['GET','PUT','DELETE'].includes(method))error('Método não permitido.',405);
        if(portfolioMatch&&!UUID.test(portfolioMatch[1]))error('Identificador inválido.');
        const data=await load(portfolioKey,initial),item=portfolioMatch?data.items.find(i=>i.id===portfolioMatch[1]):null;if(portfolioMatch&&!item)error('Trabalho não encontrado.',404);if(method==='GET')return send(res,200,portfolioGallery.galleryView(item));
        const b=await readBody(req,8*1024*1024);fields(b,method==='DELETE'?['version']:['title','description','date','photo','photos','clippingLinks','spotifyUrl','youtubeUrl','status','year','activity',...(item?['version']:[])]);if(item)checkVersion(b,item);
        if(method==='DELETE'){data.items=data.items.filter(i=>i!==item);await store.set(portfolioKey,data);return send(res,200,{ok:true});}
        if(!['Publicado','Rascunho'].includes(b.status))error('Situação inválida.');const date=b.date===undefined?'':text(b.date,10);if(date)meetingDate(date);
        const extras={};if(b.year!==undefined||item?.year!==undefined){const year=text(b.year===undefined?item.year:b.year,4);if(year&&!/^(19|20|21)\d{2}$/.test(year))error('Ano inválido. Use quatro dígitos ou deixe vazio.');if(year&&date&&date.slice(0,4)!==year)error('Ano e data devem corresponder.');extras.year=year;}
        if(b.activity!==undefined||item?.activity!==undefined)extras.activity=text(b.activity===undefined?item.activity:b.activity,100);
        const gallery=portfolioGallery.updateGallery(b,item,v=>photo(v),error);
        const clean=preservePresentation(item,{title:text(b.title,150,true),description:text(b.description,5000),date,...gallery,...portfolioGallery.updateLinks(b,item,error),youtubeUrl:youtubeUrl(b.youtubeUrl===undefined?(item?.youtubeUrl||''):b.youtubeUrl),status:b.status,...extras,updatedAt:new Date().toISOString()});
        if(item){delete item.photoEvidence;if(item.photo!==clean.photo)delete item.evidenceHash;Object.assign(item,clean,{version:item.version+1});}else{if(data.items.length>=100)error('Limite de 100 trabalhos atingido.',409);data.items.push({...clean,id:crypto.randomUUID(),version:1});}
        aggregate(data);await store.set(portfolioKey,data);return send(res,item?200:201,item||data.items.at(-1));
      }
      error('Método não permitido.',405);
    }
    if(p==='/api/admin/controle-inscricoes'){
      if(method!=='GET')error('Método não permitido.',405);
      const dancers=await ds(),finance=await load(KEYS.finance,{plans:[]}),plans=new Map(finance.plans.map(plan=>[plan.dancerId,plan])),envStatuses=(await approvalEnv()).statuses;
      const items=dancers.items.map(d=>{const plan=plans.get(d.id),defined=!!plan?.installments.length,active=(plan?.installments||[]).filter(i=>i.status!=='Cancelado');return {dancerId:d.id,name:d.name,phone:admin.isPrincipal||admin.permissions?.includes('dancarinos')?d.phone||'':'',notifications:envStatuses[d.id]||null,defined,totalCents:defined?active.reduce((s,i)=>s+i.baseCents,0):null,paidInstallments:defined?active.filter(i=>i.status==='Pago').length:null,installmentsCount:defined?active.length:null,balanceCents:defined?active.filter(i=>i.status==='Pendente').reduce((s,i)=>s+i.baseCents,0):null,receivedCents:defined?active.filter(i=>i.status==='Pago').reduce((s,i)=>s+i.payment.amountCents,0):null,manualReceivedCents:defined?active.filter(i=>i.status==='Pago'&&i.payment.source==='manual').reduce((s,i)=>s+i.payment.amountCents,0):null,providerReceivedCents:defined?active.filter(i=>i.status==='Pago'&&i.payment.source==='mercadopago').reduce((s,i)=>s+i.payment.amountCents,0):null};});
      const totals=items.reduce((t,i)=>{t.registrations++;if(i.defined){t.definedPlans++;t.totalCents+=i.totalCents;t.balanceCents+=i.balanceCents;t.paidInstallments+=i.paidInstallments;t.installmentsCount+=i.installmentsCount;t.receivedCents+=i.receivedCents;t.manualReceivedCents+=i.manualReceivedCents;t.providerReceivedCents+=i.providerReceivedCents;}else t.undefinedPlans++;return t;},{registrations:0,definedPlans:0,undefinedPlans:0,totalCents:0,balanceCents:0,paidInstallments:0,installmentsCount:0,receivedCents:0,manualReceivedCents:0,providerReceivedCents:0});
      return send(res,200,{items,totals});
    }
    if(p==='/api/pagamentos/mercadopago/webhook')return mp.webhook(req,res,u);
    if(p==='/api/admin/contribuicao-2027'){
      if(!['GET','PUT'].includes(method))error('Método não permitido.',405);const previous=await contributionConfig();if(method==='GET')return send(res,200,previous);
      const b=await readBody(req);fields(b,['version','totalCents','maxInstallments','installmentBaseCents']);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==previous.version)error('Condição alterada em outra sessão. Recarregue antes de salvar.',409);
      const clean={...previous,...contributionValues(b),year:2027,version:b.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.contribution,clean);return send(res,200,clean);
    }
    if(p==='/api/admin/pagamentos/links'){
      if(!['GET','PUT'].includes(method))error('Método não permitido.',405);
      const previous=await manualConfig();if(method==='GET')return send(res,200,previous);
      const b=await readBody(req);fields(b,['generalUrl','reportedAmountCents','version']);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==previous.version)error('Link geral alterado em outra sessão. Recarregue antes de salvar.',409);
      const generalUrl=manualUrl(b.generalUrl);let reportedAmountCents=generalUrl===previous.generalUrl?(previous.reportedAmountCents??null):null,reportedAmountSource=reportedAmountCents===null?null:(previous.reportedAmountSource??'administrador');if(b.reportedAmountCents!==undefined){reportedAmountCents=b.reportedAmountCents===null?null:integer(b.reportedAmountCents,1,MAX_CENTS,'Valor informado em centavos');reportedAmountSource=reportedAmountCents===null?null:'administrador';}if(!generalUrl){reportedAmountCents=null;reportedAmountSource=null;}const clean={...previous,generalUrl,reportedAmountCents,reportedAmountSource,version:b.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.manualLinks,clean);return send(res,200,clean);
    }
    if(p==='/api/admin/pagamentos/status'){if(method!=='GET')error('Método não permitido.',405);return send(res,200,mp.status());}
    if(p==='/api/admin/grupo-dancarinos'){
      if(!['GET','PUT'].includes(method))error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      const previous=await groupConfig();if(method==='GET')return send(res,200,previous);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);fields(b,['url','version']);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==previous.version)error('Link do grupo alterado em outra sessão. Recarregue antes de salvar.',409);
      const clean={url:groupUrl(b.url),version:previous.version+1,updatedAt:new Date().toISOString()};await store.set(groupKey,clean);return send(res,200,clean);
    }
    const notifyMeetingMatch=p.match(/^\/api\/admin\/encontros\/([^/]+)\/notificar$/);
    if(notifyMeetingMatch){
      if(method!=='POST')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);fields(b,['confirm']);if(b.confirm!==true)error('Confirme a criação dos avisos.');
      const meetings=await ms(),m=meetings.find(x=>x.id===notifyMeetingMatch[1]);if(!m)error('Encontro não encontrado.',404);
      if(m.closed)error('Encontro encerrado não recebe novos avisos.',409);
      const all=(await ds()).items,activeIds=new Set(all.filter(d=>['Pendente','Aprovado'].includes(d.status)).map(d=>d.id));
      let targets=m.attendees.filter(a=>activeIds.has(a.dancerId)).map(a=>a.dancerId);if(!targets.length)targets=all.filter(d=>['Pendente','Aprovado'].includes(d.status)).map(d=>d.id);
      if(targets.length>5000)error('Limite de 5000 destinatários por aviso.',413);
      const result=await createNotices('encontro:'+m.id,noticeHash(meetingNotice(m)),{kind:m.type,title:m.title,date:m.date,location:m.location||'',description:'',href:'/perfil?aba=presencas'},targets,true);
      const now=new Date().toISOString();m.notifiedAt=now;m.notifiedTotal=(m.notifiedTotal||0)+result.created;await store.set(KEYS.meetings,meetings);
      const sharePhone=admin.isPrincipal||!!admin.permissions?.includes('dancarinos');
      const recipients=targets.map(id=>all.find(d=>d.id===id)).filter(Boolean).map(d=>({id:d.id,name:d.name,whatsapp:sharePhone?waDigits(d.phone):''}));
      const messageText='Olá! '+m.type+' da Império Nordestina: '+m.title+'. Data: '+m.date+(m.location?'. Local: '+m.location+'.':'.')+' Confirme a presença na sua área do site.';
      return send(res,200,{ok:true,created:result.created,eligible:targets.length,notifiedAt:m.notifiedAt,recipients,messageText,channel:'site',notice:'Avisos criados no site. Não é envio automático de WhatsApp; use os botões individuais por dançarino.'});
    }
    if(p==='/api/dancarinos/checkout'){if(method!=='POST')error('Método não permitido.',405);limit(req,'checkout');return mp.checkout(req,res,dancer);}
    const financeMatch=p.match(/^\/api\/admin\/dancarinos\/([^/]+)\/financeiro$/);
    if(financeMatch||p==='/api/dancarinos/financeiro'){
      if(!['GET','PUT'].includes(method)||(!financeMatch&&method!=='GET'))error('Método não permitido.',405);
      const id=financeMatch?financeMatch[1]:dancer.id;
      if(!UUID.test(id))error('Identificador inválido.');
      if(financeMatch&&!(await ds()).items.some(d=>d.id===id))error('Cadastro não encontrado.',404);
      const data=await load(KEYS.finance,{plans:[]});
      const previous=data.plans.find(x=>x.dancerId===id);
      const initial={dancerId:id,title:'',method:'Boleto',cardFeePercent:null,installments:[],version:0,updatedAt:null};
      if(method==='GET')return send(res,200,await financialView(previous||initial,data));
      mp.assertEditable(data,id);
      const b=await readBody(req);fields(b,['title','method','cardFeePercent','installments','version']);
      integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==(previous?.version||0))error('Plano alterado em outra sessão. Atualize antes de salvar.',409);
      if(!METHODS.includes(b.method))error('Método inválido.');const rate=cardRate(b.cardFeePercent);
      if(!Array.isArray(b.installments)||b.installments.length>120)error('Informe até 120 parcelas.');
      const seen=new Set();const now=new Date().toISOString();
      const installments=b.installments.map(i=>{
        fields(i,['id','baseCents','dueDate','status','confirmManualPayment','manualPaidCents','manualNote','manualPaymentUrl']);
        if(typeof i.id!=='string'||!UUID.test(i.id)||seen.has(i.id))error('Identificador de parcela inválido ou repetido.');seen.add(i.id);
        const baseCents=integer(i.baseCents,1,MAX_CENTS,'Valor em centavos'),dueDate=meetingDate(i.dueDate);
        if(!PAYMENT_STATUSES.includes(i.status))error('Status financeiro inválido.');
        if(i.confirmManualPayment!==undefined&&typeof i.confirmManualPayment!=='boolean')error('Confirmação manual inválida.');
        if(i.manualPaidCents!==undefined)integer(i.manualPaidCents,1,MAX_CENTS*2,'Valor pago em centavos');
        if(i.manualNote!==undefined)text(i.manualNote,500);
        const old=previous?.installments.find(x=>x.id===i.id);const link=i.manualPaymentUrl===undefined?(old?.manualPaymentUrl||''):manualUrl(i.manualPaymentUrl);let payment=null;
        if(old?.status==='Pago'){
          if(i.status!=='Pago'||baseCents!==old.baseCents||dueDate!==old.dueDate||i.confirmManualPayment===true||i.manualPaidCents!==undefined||i.manualNote!==undefined)error('Parcela paga é um registro fechado: não altere valor, vencimento ou pagamento.');
          payment=old.payment;
        }else if(i.status==='Pago'){
          if(i.confirmManualPayment!==true)error('Confirme explicitamente o pagamento manual.');
          payment={source:'manual',amountCents:integer(i.manualPaidCents,1,MAX_CENTS*2,'Valor pago em centavos'),note:text(i.manualNote,500,true),recordedAt:now};
        }else if(i.confirmManualPayment===true||i.manualPaidCents!==undefined||i.manualNote!==undefined)error('Pagamento manual só pode ser informado com status Pago.');
        return {id:i.id,baseCents,dueDate,status:i.status,payment,...(link?{manualPaymentUrl:link}:{})};
      });
      if(previous?.installments.some(i=>i.status==='Pago'&&!seen.has(i.id)))error('Não é permitido remover uma parcela paga.');
      const plan={dancerId:id,title:text(b.title,150,true),method:b.method,cardFeePercent:rate,installments,version:b.version+1,updatedAt:now};
      const index=data.plans.findIndex(x=>x.dancerId===id);if(index<0)data.plans.push(plan);else data.plans[index]=plan;
      await store.set(KEYS.finance,data);return send(res,200,await financialView(plan,data));
    }
    if(p==='/api/admin/notificacoes/eventos'){
      if(method!=='GET')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      return send(res,200,{items:await noticeCatalog(),channel:'site'});
    }
    const announceEvent=p.match(/^\/api\/admin\/notificacoes\/eventos\/([^/]+)\/avisar$/);
    if(announceEvent){
      if(method!=='POST')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);const b=await readBody(req,4096);fields(b,['hash','confirm']);if(b.confirm!==true)error('Confirme a criação do aviso no site.');
      const event=(await noticeCatalog()).find(e=>e.id===announceEvent[1]);if(!event)error('Evento alterado ou removido. Recarregue os eventos salvos.',404);if(b.hash!==event.hash)error('Evento alterado. Recarregue antes de avisar.',409);
      if(!event.title.trim())error('Salve um título para o evento antes de avisar.');
      const eligible=(await ds()).items.filter(d=>['Pendente','Aprovado'].includes(d.status));if(eligible.length>5000)error('Limite de 5000 destinatários por anúncio. Contate a organização.',413);
      return send(res,200,await createNotices('evento:'+event.id,event.hash,{kind:'Evento',title:event.title,date:event.date,location:event.location,description:event.description,href:'/#eventos'},eligible.map(d=>d.id)));
    }
    if(p==='/api/dancarinos/notificacoes'){
      if(method!=='GET')error('Método não permitido.',405);for(const k of u.searchParams.keys())if(!['page','pageSize'].includes(k)||u.searchParams.getAll(k).length!==1)error('Filtro de avisos inválido.');
      const number=(k,f,max)=>{const value=u.searchParams.get(k);if(value===null)return f;if(!/^[1-9]\d*$/.test(value))error('Paginação inválida.');return integer(Number(value),1,max,'Paginação');};
      const page=number('page',1,10000),pageSize=number('pageSize',20,50),{items}=await visibleNotices(dancer.id);
      return send(res,200,{items:items.slice((page-1)*pageSize,page*pageSize).map(({sourceKey,hash,...n})=>n),unread:items.filter(n=>!n.readAt).length,total:items.length,page,pageSize,channel:'site'});
    }
    const readNotice=p.match(/^\/api\/dancarinos\/notificacoes\/([^/]+)\/lida$/);
    if(readNotice){
      if(method!=='POST')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);const b=await readBody(req,1024);fields(b,[]);
      const {box,items}=await visibleNotices(dancer.id),item=items.find(n=>n.id===readNotice[1]);if(!item)error('Aviso indisponível.',404);
      const stored=box.items.find(n=>n.id===item.id);stored.readAt=stored.readAt||new Date().toISOString();await store.set(notificationKey(dancer.id),box);return send(res,200,{id:stored.id,readAt:stored.readAt});
    }
    if(p==='/api/dancarinos/grupo'){
      if(method!=='GET')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      const config=await groupConfig(),allowed=dancer.status==='Aprovado'&&!!config.url;
      return send(res,200,{configured:allowed,url:allowed?config.url:'',notice:'Convite do grupo de dançarinos. Disponível somente para cadastro aprovado e ativo, quando a organização define o link.'});
    }
    const materialAssignment=p.match(/^\/api\/admin\/materiais-2027\/destinacoes(?:\/([^/]+))?$/);
    if(materialAssignment){
      if(u.search)error('Parâmetros não permitidos.');
      const all=await ds(),assignments=await materialDestinations(),id=materialAssignment[1];
      const view=d=>({dancerId:d.id,name:d.name,status:d.status,...materialDestination(assignments,d.id)});
      if(id==='lote'){
        if(method!=='POST')error('Método não permitido.',405);
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
        const b=await readBody(req,32768);fields(b,['dancerIds','listType','versions']);
        if(!MATERIAL_TYPES.includes(b.listType))error('Lista de materiais inválida.');
        if(!Array.isArray(b.dancerIds)||!b.dancerIds.length||b.dancerIds.length>100||b.dancerIds.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(b.dancerIds).size!==b.dancerIds.length)error('Selecione de 1 a 100 cadastros distintos por operação.');
        object(b.versions);if(Object.keys(b.versions).length!==b.dancerIds.length||Object.keys(b.versions).some(id=>!b.dancerIds.includes(id)))error('Informe a versão de cada cadastro selecionado.');
        const targets=b.dancerIds.map(id=>{const d=all.items.find(i=>i.id===id);if(!d)error('Um cadastro selecionado não existe. Nenhuma destinação foi alterada.',404);if(!['Pendente','Aprovado'].includes(d.status))error('Um cadastro selecionado não está ativo. Nenhuma destinação foi alterada.',409);integer(b.versions[id],0,Number.MAX_SAFE_INTEGER-1,'Versão da atribuição');return d;});
        // Valida todas as versões antes da única escrita. Repetição exata do
        // lote já aplicado é idempotente; conflito para destino diferente falha.
        const replay=targets.every(d=>{const previous=materialDestination(assignments,d.id);return previous.listType===b.listType&&(previous.version===b.versions[d.id]||previous.version===b.versions[d.id]+1);});
        if(!replay&&targets.some(d=>materialDestination(assignments,d.id).version!==b.versions[d.id]))error('Uma destinação foi alterada. Recarregue e confira a seleção; nenhuma foi alterada neste lote.',409);
        const now=new Date().toISOString();let changed=0;
        for(const d of targets){const previous=materialDestination(assignments,d.id);if(previous.listType===b.listType)continue;const item={dancerId:d.id,listType:b.listType,version:previous.version+1,updatedAt:now};assignments.items=assignments.items.filter(i=>i.dancerId!==d.id);assignments.items.push(item);changed++;}
        if(changed)await store.set(materialDestinationsKey,assignments);
        return send(res,200,{year:2027,listType:b.listType,selected:targets.length,changed,items:targets.map(view)});
      }
      if(!id){if(method!=='GET')error('Método não permitido.',405);return send(res,200,{year:2027,items:all.items.map(view)});}
      if(!UUID.test(id))error('Cadastro não encontrado.',404);const target=all.items.find(d=>d.id===id);if(!target)error('Cadastro não encontrado.',404);
      if(method==='GET')return send(res,200,view(target));
      if(method!=='PUT')error('Método não permitido.',405);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);fields(b,['listType','version']);
      if(!MATERIAL_TYPES.includes(b.listType))error('Lista de materiais inválida.');integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão da atribuição');
      const previous=materialDestination(assignments,id);if(b.version!==previous.version)error('Atribuição alterada. Atualize antes de salvar.',409);
      const item={dancerId:id,listType:b.listType,version:previous.version+1,updatedAt:new Date().toISOString()};
      assignments.items=assignments.items.filter(i=>i.dancerId!==id);assignments.items.push(item);await store.set(materialDestinationsKey,assignments);
      return send(res,200,view(target));
    }
    if(p==='/api/dancarinos/materiais-2027/respostas'){

      if(u.search)error('Não envie filtros ou identidade de outro cadastro.');
      if(method==='GET')return send(res,200,await ownMaterials(dancer.id));
      if(!['POST','PUT'].includes(method))error('Método não permitido.',405);
      origin(req);if(req.headers['sec-fetch-site']==='cross-site')error('Origem não autorizada.',403);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      const b=await readBody(req,4096);fields(b,['itemId','hasMaterial','version','listVersion','assignmentVersion']);
      if(typeof b.itemId!=='string'||!UUID.test(b.itemId)||typeof b.hasMaterial!=='boolean')error('Informe itemId UUID e hasMaterial booleano.');
      integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão da resposta');const list=await materialList();if(!list.items.some(i=>i.id===b.itemId))error('Material removido ou inexistente. Atualize a lista.',404);
      const destination=materialDestination(await materialDestinations(),dancer.id);
      if(!materialAllowed(list.items.find(i=>i.id===b.itemId),destination))error('Este material não pertence à lista destinada ao seu cadastro. Atualize a lista.',403);
      integer(b.listVersion,0,Number.MAX_SAFE_INTEGER-1,'Versão da lista');integer(b.assignmentVersion,0,Number.MAX_SAFE_INTEGER-1,'Versão da atribuição');
      if(b.listVersion!==list.version||b.assignmentVersion!==destination.version)error('Lista ou atribuição alterada. Atualize antes de responder.',409);
      const data=await materialAnswers(dancer.id),previous=materialResponse(data,b.itemId);if(b.version!==previous.version)error('Resposta alterada em outra sessão. Atualize a lista antes de salvar.',409);
      // Remove respostas órfãs na próxima gravação do titular; nunca transfere por nome/posição.
      data.responses=Object.fromEntries(list.items.filter(i=>data.responses?.[i.id]).map(i=>[i.id,data.responses[i.id]]));
      const response={hasMaterial:b.hasMaterial,version:previous.version+1,updatedAt:new Date().toISOString()};data.responses[b.itemId]=response;
      if(Buffer.byteLength(JSON.stringify(data))>128*1024)error('Respostas excedem o limite de 128 KiB.',413);
      await store.set(materialAnswersKey(dancer.id),data);return send(res,200,{itemId:b.itemId,response});
    }
    if(p==='/api/admin/materiais-2027/acompanhamento'){
      if(method!=='GET')error('Método não permitido.',405);
      const allowed=new Set(['page','pageSize','name','listType']);for(const k of u.searchParams.keys())if(!allowed.has(k)||u.searchParams.getAll(k).length!==1)error('Filtro de acompanhamento inválido.');
      const number=(key,defaultValue,max)=>{const raw=u.searchParams.get(key);if(raw===null)return defaultValue;if(!/^[1-9]\d*$/.test(raw))error('Paginação inválida.');return integer(Number(raw),1,max,'Paginação');};
      const page=number('page',1,100000),pageSize=number('pageSize',25,50),name=text(u.searchParams.get('name')||'',150),list=await materialList();
      const assignments=await materialDestinations(),filter=u.searchParams.get('listType')||'';if(filter&&!MATERIAL_TYPES.includes(filter))error('Filtro de lista inválido.');
      const dancers=(await ds()).items.filter(d=>['Pendente','Aprovado'].includes(d.status)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      const totals=list.items.map(i=>({itemId:i.id,audience:i.audience,eligible:0,yes:0,no:0,notInformed:0})),matching=dancers.filter(d=>(!name||d.name.toLocaleLowerCase('pt-BR').includes(name.toLocaleLowerCase('pt-BR')))&&(!filter||materialDestination(assignments,d.id).listType===filter)),selected=matching.slice((page-1)*pageSize,page*pageSize),selectedIds=new Set(selected.map(d=>d.id)),rows=[];
      for(const d of dancers){const destination=materialDestination(assignments,d.id),answers=await materialAnswers(d.id),responses=[];list.items.forEach((i,index)=>{if(!materialAllowed(i,destination))return;const response=materialResponse(answers,i.id);totals[index].eligible++;totals[index][response.hasMaterial===true?'yes':response.hasMaterial===false?'no':'notInformed']++;responses.push({itemId:i.id,...response});});if(selectedIds.has(d.id))rows.push({dancerId:d.id,name:d.name,...destination,responses});}
      return send(res,200,{year:2027,listVersion:list.version,items:list.items,rows,totals,population:'Somente Pendente/Aprovado destinados à lista do item. Sem classificação ou atribuição não conta. Totais independem do filtro e página.',totalDancers:dancers.length,matchedDancers:matching.length,page,pageSize});
    }
    if(p==='/api/admin/materiais-2027'||p==='/api/dancarinos/materiais-2027'){
      const isWrite=p==='/api/admin/materiais-2027'&&method==='PUT';
      if(method!=='GET'&&!isWrite)error('Método não permitido.',405);
      if(u.search)error('Parâmetros não permitidos.');
      if(p==='/api/dancarinos/materiais-2027')return send(res,200,await ownMaterials(dancer.id));
      const previous=await materialList();
      if(!isWrite)return send(res,200,previous);
      const b=await readBody(req);fields(b,['items','version']);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==previous.version)error('Materiais alterados em outra sessão. Atualize antes de salvar.',409);
      if(!Array.isArray(b.items)||b.items.length>200)error('Informe até 200 materiais.');
      const ids=new Set();const items=b.items.map(i=>{fields(i,['id','name','quantity','unit','notes','audience']);let id;if(Object.hasOwn(i,'id')){if(typeof i.id!=='string'||!UUID.test(i.id)||!previous.items.some(old=>old.id===i.id)||ids.has(i.id))error('ID de material inválido, repetido ou removido. Atualize a lista.');id=i.id;}else id=crypto.randomUUID();ids.add(id);const old=previous.items.find(i=>i.id===id),audience=Object.hasOwn(i,'audience')?i.audience:materialType(old?.audience);if(!MATERIAL_TYPES.includes(audience))error('Lista de destino do material inválida.');return {id,audience,...preservePresentation(previous.items.find(old=>old.id===id),{name:text(i.name,150,true),quantity:integer(i.quantity,1,100000,'Quantidade'),unit:text(i.unit,40,true),notes:text(i.notes,1000)})};});
      if(Buffer.byteLength(JSON.stringify(items))>1024*1024)error('Lista excede 1 MiB.',413);
      const clean={year:2027,items,version:b.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.materials,clean);return send(res,200,clean);
    }
    const individualPortfolio=p.match(/^\/api\/(admin\/)?diretoria\/([^/]+)\/portfolio$/);
    if(individualPortfolio){const adminRoute=!!individualPortfolio[1],id=individualPortfolio[2];if(!UUID.test(id))error('Integrante não encontrado.',404);const data=await boardData(),group=data.groups.find(g=>g.items.some(p=>p.id===id)),person=group?.items.find(p=>p.id===id);if(!person)error('Integrante não encontrado.',404);const portfolios=await boardPortfolios(),existing=portfolios.items.find(p=>p.memberId===id);
      if(!adminRoute){if(method!=='GET')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');if(!existing?.published||!existing.public||!portfolioFilled(existing.public))error('Portfólio indisponível.',404);return send(res,200,{member:{id:person.id,name:person.name,role:person.role,description:person.description,photo:person.photo,group:group.title},portfolio:existing.public});}
      if(method==='GET')return send(res,200,{memberId:id,version:existing?.version||0,published:existing?.published===true,draft:existing?.draft||emptyBoardPortfolio(),quota:{usedBytes:Buffer.byteLength(JSON.stringify(portfolios)),maxBytes:16*1024*1024,maxPhotos:10,maxPhotoBytes:MAX_PHOTO,maxRequestBytes:8*1024*1024}});
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);const b=await readBody(req,8*1024*1024);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==(existing?.version||0))error('Portfólio alterado. Recarregue antes de salvar.',409);
      if(method==='DELETE'){fields(b,['version']);portfolios.items=portfolios.items.filter(p=>p.memberId!==id);portfolios.version++;await store.set(boardPortfolioKey,portfolios);return send(res,200,{ok:true});}
      if(method!=='PUT')error('Método não permitido.',405);fields(b,['version','action','title','introduction','trajectory','photos','youtubeUrl','clippingLinks','spotifyUrl']);if(!['save','publish','unpublish'].includes(b.action))error('Ação inválida.');
      const record=existing||{memberId:id,version:0,published:false,draft:emptyBoardPortfolio(),public:null};
      if(b.action==='unpublish'){fields(b,['version','action']);record.published=false;record.public=null;}
      else{const photos=portfolioGallery.updateGallery({photos:b.photos},{},v=>photo(v),error);const links=portfolioGallery.updateLinks({clippingLinks:b.clippingLinks,spotifyUrl:b.spotifyUrl},{},error);const draft={title:text(b.title,150),introduction:text(b.introduction,1000),trajectory:text(b.trajectory,5000),photos:photos.photos.map(p=>({image:p.image})),youtubeUrl:youtubeUrl(b.youtubeUrl),...links};if(b.action==='publish'&&!portfolioFilled(draft))error('Preencha ao menos um campo antes de publicar.');record.draft=draft;if(b.action==='publish'){record.public=structuredClone(draft);record.published=true;}}
      record.version++;record.updatedAt=new Date().toISOString();if(!existing)portfolios.items.push(record);portfolios.version++;if(Buffer.byteLength(JSON.stringify(portfolios))>16*1024*1024)error('Cota global de 16 MiB dos portfólios individuais excedida. Reduza fotos ou remova portfólios antigos.',413);await store.set(boardPortfolioKey,portfolios);return send(res,200,{ok:true,version:record.version,published:record.published});
    }
    if(p==='/api/admin/diretoria'&&method==='GET')return send(res,200,await boardData());
    if(method==='GET'&&p==='/api/diretoria')return send(res,200,await publicBoard());
    if(method==='POST'&&p==='/api/dancarinos/cadastro'){
      const b=await readBody(req,4*1024*1024);fields(b,['name','birth','phone','city','email','password','cpf','rgSameAsCpf','rg','photo','experience','message','consent','guardian','requestId']);if(b.consent!==true)error('Consentimento obrigatório.');if(!UUID.test(b.requestId))error('requestId deve ser UUID.');const clean=profile(b,profilePhoto),pass=password(b.password),payload={...clean,password:pass,consent:true};const data=await ds();const previous=await receipt(data.receipts,b.requestId,payload);if(previous)return send(res,201,previous);unique(data.items,clean);const id=crypto.randomUUID(),response={id,message:'Cadastro recebido. Aguarde a organização.'};data.items.push({...clean,id,joinedAt:new Date().toISOString(),status:'Pendente',...await credentials(pass)});data.receipts.push({requestId:b.requestId,...await credentials(canonical(payload)),response});await store.set(KEYS.dancers,data);return send(res,201,response);
    }
    if(method==='POST'&&p==='/api/dancarinos/entrar'){
      const b=await readBody(req);const data=await ds();const d=data.items.find(d=>d.email===String(b.email||'').trim().toLowerCase());const candidate=typeof b.password==='string'&&b.password.length>=6&&b.password.length<=256?b.password:'';const salt=d?d.salt:'00'.repeat(32);const hash=await digest(candidate,salt);if(!d||!secureEqual(hash,d.hash)||d.status==='Inativo')error('E-mail ou senha inválidos.',401);const previous=ownSession(req);if(previous)dancerSessions.delete(previous.id);if(dancerSessions.size>=10000)error('Serviço ocupado. Aguarde.',503);const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');dancerSessions.set(id,{dancerId:d.id,passwordHash:d.hash,csrf,expires:Date.now()+8*3600000});return send(res,200,{csrf,name:d.name},{'Set-Cookie':cookie(id,8*3600)});
    }
    const releaseMatch=p.match(/^\/api\/admin\/encontros\/([^/]+)\/autopresenca$/);
    if(releaseMatch){
      if(method!=='POST')error('Método não permitido.',405);
      const b=await readBody(req,4096);fields(b,['action','minutes','requiresCode']);
      if(!['liberar','encerrar'].includes(b.action))error('Ação inválida.');
      if(b.action==='encerrar'&&(b.minutes!==undefined||b.requiresCode!==undefined))error('Campo não permitido ao encerrar.');
      if(b.requiresCode!==undefined&&typeof b.requiresCode!=='boolean')error('Exigência de código inválida.');
      const requiresCode=b.requiresCode!==false;
      const minutes=b.minutes===undefined?30:b.minutes;if(![15,30,60,120].includes(minutes))error('Duração inválida.');
      const meetings=await ms(),m=meetings.find(m=>m.id===releaseMatch[1]);if(!m)error('Encontro não encontrado.',404);
      if(b.action==='encerrar'){revokeCheckin(m);await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true,...checkinView(m)});}
      const now=Date.now();if(m.closed||m.date!==checkinDay(new Date(now)))error('Liberação permitida somente em encontro aberto de hoje, em America/Araguaina.',409);
      const code=requiresCode?crypto.randomBytes(6).toString('hex').toUpperCase():null;m.autoCheckin={enabled:true,requiresCode,...(requiresCode?{codeHash:codeHash(code),attempts:{}}:{}),generation:crypto.randomUUID(),openedAt:new Date(now).toISOString(),expiresAt:new Date(now+minutes*60000).toISOString()};
      await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true,...(requiresCode?{code}:{}),...checkinView(m)});
    }
    const selfMatch=p.match(/^\/api\/dancarinos\/encontros\/([^/]+)\/presenca$/);
    if(selfMatch){
      if(method!=='POST')error('Método não permitido.',405);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      origin(req);const b=await readBody(req,4096);fields(b,['code']);
      const meetings=await ms(),m=meetings.find(m=>m.id===selfMatch[1]),a=m?.attendees.find(a=>a.dancerId===dancer.id);
      if(!a)error('Encontro não disponível para seu cadastro.',404);
      if(dancer.status!=='Aprovado')error('A organização precisa aprovar seu cadastro antes da confirmação.',403);
      if(!checkinOpen(m))error('Confirmação encerrada, expirada ou fora do dia do encontro.',409);
      if(a.status==='Falta')error('Há uma falta registrada. Procure a organização para corrigir.',409);
      if(a.status==='Presente')return send(res,200,{ok:true,status:a.status,source:a.source??null,recordedAt:a.recordedAt??null});
      if(a.status!=='Pendente')error('Registro indisponível para confirmação.',409);
      const now=Date.now(),window=m.autoCheckin;
      if(window.requiresCode!==false){window.attempts??={};let attempt=window.attempts[dancer.id];
      if(!attempt||Date.parse(attempt.resetAt)<=now)attempt={failures:0,resetAt:new Date(now+15*60000).toISOString()};
      if(attempt.failures>=5)error('Limite de tentativas atingido. Aguarde 15 minutos ou nova liberação.',429);
      const candidate=typeof b.code==='string'&&b.code.length<=64?b.code.trim().toUpperCase():'';
      if(!/^[A-F0-9]{12}$/.test(candidate)||!secureEqual(codeHash(candidate),window.codeHash)){
        attempt.failures++;window.attempts[dancer.id]=attempt;await store.set(KEYS.meetings,meetings);
        error(attempt.failures>=5?'Limite de tentativas atingido. Aguarde 15 minutos ou nova liberação.':'Código inválido. Confira com a organização.',attempt.failures>=5?429:400);
      }
      delete window.attempts[dancer.id];}
      a.status='Presente';a.source='self';a.recordedAt=new Date(now).toISOString();
      await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true,status:a.status,source:a.source,recordedAt:a.recordedAt});
    }
    if(method==='GET'&&p==='/api/dancarinos/eu'){const meetings=await ms();const attendance=meetings.flatMap(m=>{const a=m.attendees.find(a=>a.dancerId===dancer.id);return a?[{id:m.id+':'+dancer.id,sessionId:m.id,type:m.type,title:m.title,date:m.date,closed:m.closed,status:a.status,reason:a.reason,source:a.source??null,recordedAt:a.recordedAt??null,...checkinView(m),selfCheckinOpen:dancer.status==='Aprovado'&&checkinOpen(m),expiresAt:dancer.status==='Aprovado'&&checkinOpen(m)?m.autoCheckin.expiresAt:null}]:[];});return send(res,200,{profile:publicProfile(dancer),attendance,stats:stats(dancer.id,meetings),csrf:own.csrf});}
    if(method==='POST'&&p==='/api/dancarinos/sair'){dancerSessions.delete(own.id);return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
    if(method==='PUT'&&p==='/api/dancarinos/perfil'){const b=await readBody(req,4*1024*1024);fields(b,['phone','city','photo','message']);const data=await ds(),d=data.items.find(d=>d.id===dancer.id);for(const k of Object.keys(b))d[k]=k==='phone'?phone(b[k]):k==='photo'?profilePhoto(b[k]):text(b[k],k==='city'?150:2000,k==='city');await store.set(KEYS.dancers,data);return send(res,200,{ok:true});}
    if(method==='PUT'&&p==='/api/dancarinos/senha'){const b=await readBody(req);fields(b,['currentPassword','password']);const pass=password(b.password);if(typeof b.currentPassword!=='string'||b.currentPassword.length<6||b.currentPassword.length>256||!secureEqual(await digest(b.currentPassword,dancer.salt),dancer.hash))error('Senha atual inválida.',403);const data=await ds(),d=data.items.find(d=>d.id===dancer.id);Object.assign(d,await credentials(pass));await store.set(KEYS.dancers,data);dancerSessions.get(own.id).passwordHash=d.hash;revoke(d.id,own.id);return send(res,200,{ok:true});}
    let match=p.match(/^\/api\/dancarinos\/faltas\/([^/]+)$/);
    if(method==='PUT'&&match){const b=await readBody(req);fields(b,['reason']);const meetings=await ms();let id;try{id=decodeURIComponent(match[1]);}catch{error('Identificador inválido.');}const m=meetings.find(m=>m.id+':'+dancer.id===id),a=m?.attendees.find(a=>a.dancerId===dancer.id);if(!a)error('Falta não encontrada.',404);if(a.status!=='Falta')error('Só é possível justificar sua própria falta.',403);a.reason=text(b.reason,2000);await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true});}
    if(method==='GET'&&p==='/api/admin/dancarinos'){const data=await ds(),meetings=await ms(),envStatuses=(await approvalEnv()).statuses;return send(res,200,{items:data.items.map(d=>({...publicProfile(d),approvalVersion:approvalVersion(d),notifications:envStatuses[d.id]||null,whatsappDigits:waDigits(d.phone),...(admin.isPrincipal||admin.permissions?.includes('presencas')?{stats:stats(d.id,meetings)}:{})})),mailEnabled:!!mailConfig(),whatsappCloudEnabled:!!whatsappCloudConfig()});}
    const approveMatch=p.match(/^\/api\/admin\/dancarinos\/([^/]+)\/aprovacao$/);
    if(approveMatch){
      if(method!=='POST')error('Método não permitido.',405);if(u.search)error('Parâmetros não permitidos.');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON.',415);
      const b=await readBody(req,4096);fields(b,['status','version','guardianReviewed']);
      if(b.status!=='Aprovado')error('Esta ação somente aprova inscrições pendentes.');
      if(typeof b.version!=='string'||! /^[a-f0-9]{64}$/.test(b.version))error('Atualize o cadastro antes de aprovar.');
      if(b.guardianReviewed!==undefined&&typeof b.guardianReviewed!=='boolean')error('Confirmação de conferência inválida.');
      const data=await ds(),d=data.items.find(i=>i.id===approveMatch[1]);if(!d)error('Cadastro não encontrado.',404);
      if(d.status==='Inativo')error('Cadastro inativo não pode ser aprovado por este atalho. Confira o cadastro e sua situação.',409);
      if(d.status==='Aprovado')return send(res,200,{id:d.id,status:d.status,version:approvalVersion(d),alreadyApproved:true,notifications:(await approvalEnv()).statuses[d.id]||null});
      if(d.status!=='Pendente')error('Situação incompatível. Atualize a lista.',409);
      if(b.version!==approvalVersion(d))error('Cadastro alterado desde a consulta. Atualize e confira antes de aprovar.',409);
      // Valida o estado atual sem normalizar/regravar documentos ou fotos.
      profile(d,profilePhoto);
      if(age(d.birth)<18&&b.guardianReviewed!==true)error('Confira os dados e a autorização do responsável antes de aprovar o menor.');
      d.status='Aprovado';await store.set(KEYS.dancers,data);
      // A aprovação já é definitiva: falha de e-mail/WhatsApp nunca desfaz nem bloqueia.
      const dispatch=await dispatchApproval(d);
      return send(res,200,{id:d.id,status:d.status,version:approvalVersion(d),alreadyApproved:false,notifications:dispatch.record,whatsappUrl:dispatch.whatsappUrl,noticesCreated:dispatch.created});
    }
    match=p.match(/^\/api\/admin\/dancarinos\/([^/]+)(\/senha)?$/);
    if(match&&['PUT','DELETE'].includes(method)){
      const data=await ds(),d=data.items.find(d=>d.id===match[1]);if(!d)error('Cadastro não encontrado.',404);
      if(method==='DELETE'&&!match[2]){mp.assertEditable(await load(KEYS.finance,{plans:[]}),d.id);const meetings=await ms();for(const m of meetings){if(m.attendees.some(a=>a.dancerId===d.id))revokeCheckin(m);m.attendees=m.attendees.filter(a=>a.dancerId!==d.id);}await store.set(KEYS.meetings,meetings);data.items=data.items.filter(x=>x.id!==d.id);await store.set(KEYS.dancers,data);await store.set(notificationKey(d.id),{items:[],receipts:[]});await store.set('members_trajetoria_v1_'+d.id,{items:[],version:0});await store.set(materialAnswersKey(d.id),{responses:{}});const destinations=await materialDestinations();destinations.items=destinations.items.filter(i=>i.dancerId!==d.id);await store.set(materialDestinationsKey,destinations);const shares=await sharing();shares.items=shares.items.filter(s=>s.ownerId!==d.id);await store.set(sharingKey,shares);await store.set(interactionKey(d.id),{likes:[],comments:[],rates:{}});await store.set('members_trajetoria_ritmo_v1_'+d.id,{count:0,until:0});revoke(d.id);return send(res,200,{ok:true});}
      if(method==='PUT'){const b=await readBody(req);if(match[2]){fields(b,['password']);Object.assign(d,await credentials(password(b.password)));await store.set(KEYS.dancers,data);revoke(d.id);return send(res,200,{ok:true});}fields(b,['name','birth','phone','city','email','cpf','rgSameAsCpf','rg','photo','experience','message','guardian','status']);const clean=profile({...d,...b},value=>value===d.photo?profilePhoto(value):photo(value));unique(data.items,clean,d.id);const status=b.status??d.status;if(!['Pendente','Aprovado','Inativo'].includes(status))error('Status inválido.');const previousSource=authorizationSource(d);Object.assign(d,clean,{status});await store.set(KEYS.dancers,data);const sourceChanged=previousSource!==authorizationSource(d);if(status==='Inativo'||sourceChanged){const shares=await sharing(),s=shares.items.find(s=>s.ownerId===d.id);if(s&&(status==='Inativo'||s.authorization||!adult(d))){if(sourceChanged&&s.authorization){s.authorization={...s.authorization,status:'invalidated',link:false,directory:false,invalidatedAt:new Date().toISOString()};}if(status==='Inativo'||!adult(d))s.enabled=false;s.version++;await store.set(sharingKey,shares);}}if(status==='Inativo')revoke(d.id);return send(res,200,{ok:true});}
    }
    if(method==='GET'&&p==='/api/admin/encontros')return send(res,200,{items:(await ms()).map(adminMeeting)});
    if(method==='POST'&&p==='/api/admin/encontros'){
      const b=await readBody(req);fields(b,['type','title','date','closed','dancerIds','location','notify']);if(b.notify!==undefined&&typeof b.notify!=='boolean')error('Informe se deseja notificar.');if(!['Ensaio','Apresentação'].includes(b.type)||b.closed!==false)error('Tipo inválido ou encontro deve iniciar aberto.');if(!Array.isArray(b.dancerIds)||b.dancerIds.length>2000||new Set(b.dancerIds).size!==b.dancerIds.length)error('Seleção inválida.');const dancers=(await ds()).items;if(b.dancerIds.some(id=>!dancers.some(d=>d.id===id&&d.status!=='Inativo')))error('Seleção contém cadastro inelegível.');const m={id:crypto.randomUUID(),type:b.type,title:text(b.title,150,true),date:meetingDate(b.date),location:text(b.location??'',180),closed:false,attendees:b.dancerIds.map(dancerId=>({dancerId,status:'Pendente',reason:''}))};const meetings=await ms();meetings.push(m);await store.set(KEYS.meetings,meetings);const notification=b.notify===true?await notifyMeeting(m):null;return send(res,201,{id:m.id,notification});
    }
    match=p.match(/^\/api\/admin\/encontros\/([^/]+)$/);
    if(match&&['PUT','DELETE'].includes(method)){let meetings=await ms();const m=meetings.find(m=>m.id===match[1]);if(!m)error('Encontro não encontrado.',404);let notification=null;if(method==='DELETE')meetings=meetings.filter(x=>x.id!==m.id);else {const beforeHash=noticeHash(meetingNotice(m)),beforeIds=new Set(m.attendees.map(a=>a.dancerId));const b=await readBody(req);fields(b,['title','date','closed','attendees','location','notify']);if(b.notify!==undefined&&typeof b.notify!=='boolean')error('Informe se deseja notificar.');if(typeof b.closed!=='boolean'||!Array.isArray(b.attendees)||b.attendees.length>2000)error('Encontro inválido.');const dancers=(await ds()).items,seen=new Set();const attendees=b.attendees.map(a=>{fields(a,['dancerId','status','reason']);if(seen.has(a.dancerId)||!dancers.some(d=>d.id===a.dancerId&&(d.status!=='Inativo'||m.attendees.some(old=>old.dancerId===d.id)))||!['Pendente','Presente','Falta'].includes(a.status))error('Presença inválida.');seen.add(a.dancerId);const previous=m.attendees.find(old=>old.dancerId===a.dancerId);const record={...previous,dancerId:a.dancerId,status:a.status,reason:text(a.reason??'',2000)};if(!previous||previous.status!==a.status){if(previous?.source)record.previousRecord={status:previous.status,source:previous.source,recordedAt:previous.recordedAt??null};record.source='admin';record.recordedAt=new Date().toISOString();}return record;});const nextDate=meetingDate(b.date,b.closed),nextTitle=text(b.title,150,true);if(b.closed||m.date!==nextDate||m.attendees.length!==attendees.length||m.attendees.some(old=>!seen.has(old.dancerId)))revokeCheckin(m);Object.assign(m,{title:nextTitle,date:nextDate,location:text(b.location??m.location??'',180),closed:b.closed,attendees});const relevant=beforeHash!==noticeHash(meetingNotice(m))||attendees.some(a=>!beforeIds.has(a.dancerId));await store.set(KEYS.meetings,meetings);if(b.notify===true&&!m.closed&&relevant)notification=await notifyMeeting(m);}await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true,notification});}
    if(method==='POST'&&p==='/api/pedidos'){
      const b=await readBody(req);fields(b,['name','phone','size','quantity','consent','requestId']);if(b.consent!==true||!UUID.test(b.requestId))error('Consentimento e requestId UUID obrigatórios.');if(!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>20)error('Quantidade deve ser um inteiro entre 1 e 20.');const payload={name:text(b.name,150,true),phone:phone(b.phone),size:text(b.size,12,true),quantity:b.quantity,consent:true};const data=await os(),previous=await receipt(data.receipts,b.requestId,payload);if(previous)return send(res,201,previous);const shirt=getContent()?.shirt;if(!shirt||!Array.isArray(shirt.sizes)||!shirt.sizes.includes(payload.size)||typeof shirt.price!=='number'||!Number.isFinite(shirt.price)||shirt.price<=0||shirt.price>100000)error('Tamanho ou preço indisponível.');const unitPrice=Math.round(shirt.price*100)/100,total=Math.round(unitPrice*100)*payload.quantity/100;const id=crypto.randomUUID(),response={id,unitPrice,total,message:'Pedido registrado. Confirme a retirada com a organização.'};data.items.push({id,name:payload.name,phone:payload.phone,size:payload.size,quantity:payload.quantity,unitPrice,total,createdAt:new Date().toISOString(),status:'Recebido'});data.receipts.push({requestId:b.requestId,...await credentials(canonical(payload)),response});await store.set(KEYS.orders,data);return send(res,201,response);
    }
    if(method==='GET'&&p==='/api/admin/pedidos')return send(res,200,{items:(await os()).items});
    match=p.match(/^\/api\/admin\/pedidos\/([^/]+)$/);
    if(match&&['PUT','DELETE'].includes(method)){const data=await os(),o=data.items.find(o=>o.id===match[1]);if(!o)error('Pedido não encontrado.',404);if(method==='DELETE')data.items=data.items.filter(x=>x.id!==o.id);else {const b=await readBody(req);fields(b,['status']);if(!['Recebido','Em preparação','Pronto para retirada','Entregue','Cancelado'].includes(b.status))error('Status inválido.');o.status=b.status;}await store.set(KEYS.orders,data);return send(res,200,{ok:true});}
    if(method==='PUT'&&p==='/api/admin/diretoria'){
      const b=await readBody(req);fields(b,['groups','version']);const previous=await boardData();if(b.version!==undefined&&b.version!==previous.version)error('Diretoria alterada. Recarregue antes de salvar.',409);const previousIds=new Set(previous.groups.flatMap(g=>g.items.map(i=>i.id))),memberIds=new Set();if(!Array.isArray(b.groups)||b.groups.length!==GROUPS.length)error('Informe os cinco grupos fixos.');const keys=new Set();let photos=0;const groups=GROUPS.map(([key,title])=>{const g=b.groups.find(g=>g&&g.key===key);fields(g,['key','title','items']);if(keys.has(g.key)||g.title!==title||!Array.isArray(g.items)||g.items.length>30)error('Grupo inválido.');keys.add(key);return {key,title,items:g.items.map(i=>{fields(i,['id','name','role','description','photo']);let id;if(i.id!==undefined){if(typeof i.id!=='string'||!UUID.test(i.id)||!previousIds.has(i.id)||memberIds.has(i.id))error('ID de integrante inválido, repetido ou excluído. Atualize a diretoria.');id=i.id;}else id=crypto.randomUUID();memberIds.add(id);const p=photo(i.photo??'',false);photos+=p.length;return {id,name:text(i.name,150,true),role:text(i.role,150,true),description:text(i.description??'',1500),photo:p};})};});if(photos>1500000)error('Imagens da diretoria excedem o limite total de 1,5 MB em base64.');await store.set(KEYS.board,groups);await store.set(boardMetaKey,{version:previous.version+1});const portfolios=await boardPortfolios(),kept=portfolios.items.filter(p=>memberIds.has(p.memberId));if(kept.length!==portfolios.items.length)await store.set(boardPortfolioKey,{items:kept,version:portfolios.version+1});return send(res,200,{ok:true,groups,version:previous.version+1});
    }
    return send(res,404,{error:'Rota não encontrada.'});
  }
  async function eligibleHighlightProfiles(){const settings=await sharing(),all=await ds(),byId=new Map(all.items.map(d=>[d.id,d]));return settings.items.map(s=>getPublicProfileInfo(s,byId.get(s.ownerId))).filter(Boolean);}
  async function highlightProjection(source){if(!Array.isArray(source.highlights))return source;const available=new Map((await eligibleHighlightProfiles()).map(p=>[p.publicId,p]));return {...source,highlights:source.highlights.map((h,index)=>{const {publicProfileIds,publicProfiles,...rest}=h;if(publicProfileIds===undefined)return rest;const ids=Array.isArray(publicProfileIds)?publicProfileIds:[];return {...rest,publicProfiles:[...new Set(ids)].slice(0,index===0?2:1).map(id=>available.get(id)).filter(Boolean)};})};}
  function normalizeHighlightIds(value,index){if(value===undefined)return undefined;const max=index===0?2:1;if(!Array.isArray(value)||value.length>max||value.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(value).size!==value.length)error('Selecione até '+max+' trajetória(s) pública(s), sem repetir.');return [...value];}
  async function validateHighlightBindings(candidate,previous){const available=new Set((await eligibleHighlightProfiles()).map(p=>p.publicId));for(const [index,h]of candidate.highlights.entries()){const ids=normalizeHighlightIds(h.publicProfileIds,index)||[],old=previous.highlights?.[index]?.publicProfileIds||[];for(const id of ids)if(!available.has(id)&&!old.includes(id))error('Perfil indisponível. A pessoa precisa ativar sua trajetória pública.',409);}return candidate;}
  const handler=async function members(req,res,u){const p=u.pathname;if(!(/^\/api\/(admin\/)?diretoria\/[^/]+\/portfolio$/.test(p)||p.startsWith('/api/admin/notificacoes/eventos')||p==='/api/admin/destaques/perfis'||p==='/api/admin/participantes'||p==='/trajetorias'||p.startsWith('/trajetorias/')||p==='/api/trajetorias'||p.startsWith('/api/trajetorias/')||p.startsWith('/api/admin/trajetorias')||p.startsWith('/api/dancarinos/')||p.startsWith('/api/admin/dancarinos')||p==='/api/admin/grupo-dancarinos'||p.startsWith('/api/admin/encontros')||p.startsWith('/api/admin/pedidos')||p==='/api/admin/diretoria'||p==='/api/admin/materiais-2027'||p==='/api/admin/materiais-2027/acompanhamento'||/^\/api\/admin\/materiais-2027\/destinacoes(?:\/[^/]+)?$/.test(p)||p==='/api/admin/pagamentos/status'||p==='/api/admin/pagamentos/links'||p==='/api/admin/contribuicao-2027'||p==='/api/admin/controle-inscricoes'||p==='/api/pagamentos/mercadopago/webhook'||p==='/api/pedidos'||p==='/api/diretoria'||p==='/api/patrocinadores'||p==='/api/patrocinadores/submissoes'||p==='/api/portfolio'||/^\/api\/admin\/(patrocinadores|portfolio)(\/[^/]+)?$/.test(p)))return false;try{if(!['GET','HEAD'].includes(req.method))writeOrigin(req);if(req.method==='POST'&&['/api/dancarinos/cadastro','/api/dancarinos/entrar','/api/pedidos','/api/patrocinadores/submissoes'].includes(p)){origin(req);limit(req,p==='/api/dancarinos/entrar'?'login':p);}await serial(()=>route(req,res,u));}catch(e){if(!e.status)console.error('Falha na extensão de membros:',e.code||e.name);if(!res.headersSent&&!res.destroyed)send(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}return true;};
  handler.highlightProjection=source=>serial(()=>highlightProjection(source));
  handler.validateHighlightBindings=(candidate,previous)=>serial(()=>validateHighlightBindings(candidate,previous));
  return handler;
};
module.exports.displayText=displayText;
module.exports.displayProjection=displayProjection;
module.exports.preservePresentation=preservePresentation;
