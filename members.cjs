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
function date(v) { meetingDate(v); if(v>new Date().toISOString().slice(0,10)) error('Nascimento não pode ser futuro.'); return v; }
function age(v) { const now=new Date(),d=new Date(v+'T00:00:00Z');return now.getUTCFullYear()-d.getUTCFullYear()-(now.getUTCMonth()<d.getUTCMonth()||(now.getUTCMonth()===d.getUTCMonth()&&now.getUTCDate()<d.getUTCDate())?1:0); }
function password(v) { if(typeof v!=='string'||v.length<8||v.length>256) error('Senha deve ter entre 8 e 256 caracteres.');return v; }
function photo(v, required=true) {
  if(!required&&v==='')return '';
  if(typeof v!=='string'||v.length>Math.ceil(MAX_PHOTO/3)*4+40) error('Foto obrigatória: PNG, JPEG ou WebP, até 512 KiB e 800 pixels por lado.');
  const m=v.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)error('Foto deve ser PNG, JPEG ou WebP.');
  const b=Buffer.from(m[2],'base64');if(!b.length||b.length>MAX_PHOTO||b.toString('base64')!==m[2])error('Foto inválida ou acima de 512 KiB.');let w=0,h=0;
  if(m[1]==='png') { if(b.length<33||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(8)!==13)error('PNG inválido.');w=b.readUInt32BE(16);h=b.readUInt32BE(20); }
  else if(m[1]==='jpeg') { if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)error('JPEG inválido.');let p=2;while(p+4<=b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const mark=b[p++];if(mark===217||mark===218)break;if(mark===1||(mark>=208&&mark<=215))continue;if(p+2>b.length)break;const len=b.readUInt16BE(p);if(len<2||p+len>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(mark)&&len>=8){h=b.readUInt16BE(p+3);w=b.readUInt16BE(p+5);break;}p+=len;} }
  else {if(b.length<25||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)+8!==b.length)error('WebP inválido.');const kind=b.toString('ascii',12,16);if(kind==='VP8X'&&b.length>=30){if(b[20]&2)error('Use foto estática.');w=1+b.readUIntLE(24,3);h=1+b.readUIntLE(27,3);}else if(kind==='VP8L'&&b[20]===47){w=1+((b[21]|b[22]<<8)&16383);h=1+(((b[22]>>6)|(b[23]<<2)|(b[24]<<10))&16383);}else if(kind==='VP8 '&&b.length>=30&&b[23]===157&&b[24]===1&&b[25]===42){w=b.readUInt16LE(26)&16383;h=b.readUInt16LE(28)&16383;} }
  if(!w||!h||w>800||h>800)error('Foto inválida: limite de 800 pixels por lado.');return v;
}
function guardian(v, minor) {if(v===null||v===undefined){if(minor)error('Menor precisa de responsável completo e consentimento.');return null;}fields(v,['name','cpf','phone','email','relationship','consent']);if(v.consent!==true)error('Consentimento do responsável obrigatório.');return {name:text(v.name,150,true),cpf:cpf(v.cpf),phone:phone(v.phone),email:email(v.email),relationship:text(v.relationship,80,true),consent:true};}
function profile(v) {object(v);if(typeof v.rgSameAsCpf!=='boolean')error('Informe se RG é igual ao CPF.');const birth=date(v.birth);const rg=text(v.rg??'',40,!v.rgSameAsCpf);return {name:text(v.name,150,true),birth,phone:phone(v.phone),city:text(v.city,150,true),email:email(v.email),cpf:cpf(v.cpf),rgSameAsCpf:v.rgSameAsCpf,rg,photo:photo(v.photo),experience:text(v.experience??'',2000),message:text(v.message??'',2000),guardian:guardian(v.guardian,age(birth)<18)};}
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
module.exports=function createMembers({store,session:adminSession,permitted,getContent,send,secure=false}) {
  const rawSend=send;send=(res,status,data,headers)=>rawSend(res,status,displayProjection(data),headers);
  const dancerSessions=new Map(),rates=new Map();let tail=Promise.resolve();
  // Uma fila para todas as leituras/mutações desta extensão no processo único.
  const serial=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
  const load=async(key,initial)=>await store.get(key)??structuredClone(initial);
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
  async function recoveryLimit(req,address=''){
    const data=await load(recoveryKey,{rates:{}}),now=Date.now();data.rates??={};
    for(const[k,v]of Object.entries(data.rates))if(v.until<=now)delete data.rates[k];
    const entries=address?[['email:'+codeHash(address),5]]:[['ip:'+codeHash(req.socket.remoteAddress||'unknown'),20]];
    if(Object.keys(data.rates).length>10000)error('Muitas tentativas. Aguarde 15 minutos.',429);
    let blocked=false;for(const[k,max]of entries){const r=data.rates[k]??={count:0,until:now+15*60000};if(++r.count>max)blocked=true;}
    await store.set(recoveryKey,data);if(blocked)error('Muitas tentativas. Aguarde 15 minutos.',429);
  }
  const ds=()=>load(KEYS.dancers,{items:[],receipts:[]});const ms=()=>load(KEYS.meetings,[]);const os=()=>load(KEYS.orders,{items:[],receipts:[]});
  const materialAnswersKey=id=>'members_materiais_respostas_2027_v1_'+id;
  async function materialList(){
    const data=await load(KEYS.materials,{year:2027,items:[],version:0,updatedAt:null}),seen=new Set();let migrated=false;
    const items=data.items.map(i=>{if(typeof i.id==='string'&&UUID.test(i.id)&&!seen.has(i.id)){seen.add(i.id);return i;}migrated=true;const id=crypto.randomUUID();seen.add(id);return {...i,id};});
    if(!migrated)return data;
    const clean={...data,items,version:data.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.materials,clean);return clean;
  }
  const materialAnswers=id=>load(materialAnswersKey(id),{responses:{}});
  function materialResponse(data,id){const r=data.responses?.[id];return r&&typeof r.hasMaterial==='boolean'?{hasMaterial:r.hasMaterial,updatedAt:r.updatedAt,version:r.version}:{hasMaterial:null,updatedAt:null,version:0};}
  async function ownMaterials(id){const list=await materialList(),answers=await materialAnswers(id);return {year:2027,listVersion:list.version,items:list.items.map(i=>({...i,response:materialResponse(answers,i.id)}))};}
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
    if(isAdmin){admin=adminSession(req);if(!admin){if((p==='/api/admin/controle-inscricoes'||p==='/api/admin/materiais-2027/acompanhamento'||p.startsWith('/api/admin/patrocinadores')||p.startsWith('/api/admin/portfolio'))&&ownSession(req))error(p==='/api/admin/controle-inscricoes'?'Controle de inscrições exclusivo do administrador.':'Recurso exclusivo do administrador.',403);error('Entre para acessar o painel.',401);}if(method!=='GET'&&!permitted(req,admin))error('Token administrativo inválido.',403);}
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
      const dancers=await ds(),finance=await load(KEYS.finance,{plans:[]}),plans=new Map(finance.plans.map(plan=>[plan.dancerId,plan]));
      const items=dancers.items.map(d=>{const plan=plans.get(d.id),defined=!!plan?.installments.length,active=(plan?.installments||[]).filter(i=>i.status!=='Cancelado');return {dancerId:d.id,name:d.name,phone:d.phone||'',defined,totalCents:defined?active.reduce((s,i)=>s+i.baseCents,0):null,paidInstallments:defined?active.filter(i=>i.status==='Pago').length:null,installmentsCount:defined?active.length:null,balanceCents:defined?active.filter(i=>i.status==='Pendente').reduce((s,i)=>s+i.baseCents,0):null,receivedCents:defined?active.filter(i=>i.status==='Pago').reduce((s,i)=>s+i.payment.amountCents,0):null,manualReceivedCents:defined?active.filter(i=>i.status==='Pago'&&i.payment.source==='manual').reduce((s,i)=>s+i.payment.amountCents,0):null,providerReceivedCents:defined?active.filter(i=>i.status==='Pago'&&i.payment.source==='mercadopago').reduce((s,i)=>s+i.payment.amountCents,0):null};});
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
    if(p==='/api/dancarinos/materiais-2027/respostas'){
      if(u.search)error('Não envie filtros ou identidade de outro cadastro.');
      if(method==='GET')return send(res,200,await ownMaterials(dancer.id));
      if(!['POST','PUT'].includes(method))error('Método não permitido.',405);
      origin(req);if(req.headers['sec-fetch-site']==='cross-site')error('Origem não autorizada.',403);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))error('Envie JSON com Content-Type application/json.',415);
      const b=await readBody(req,4096);fields(b,['itemId','hasMaterial','version']);
      if(typeof b.itemId!=='string'||!UUID.test(b.itemId)||typeof b.hasMaterial!=='boolean')error('Informe itemId UUID e hasMaterial booleano.');
      integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão da resposta');const list=await materialList();if(!list.items.some(i=>i.id===b.itemId))error('Material removido ou inexistente. Atualize a lista.',404);
      const data=await materialAnswers(dancer.id),previous=materialResponse(data,b.itemId);if(b.version!==previous.version)error('Resposta alterada em outra sessão. Atualize a lista antes de salvar.',409);
      // Remove respostas órfãs na próxima gravação do titular; nunca transfere por nome/posição.
      data.responses=Object.fromEntries(list.items.filter(i=>data.responses?.[i.id]).map(i=>[i.id,data.responses[i.id]]));
      const response={hasMaterial:b.hasMaterial,version:previous.version+1,updatedAt:new Date().toISOString()};data.responses[b.itemId]=response;
      if(Buffer.byteLength(JSON.stringify(data))>128*1024)error('Respostas excedem o limite de 128 KiB.',413);
      await store.set(materialAnswersKey(dancer.id),data);return send(res,200,{itemId:b.itemId,response});
    }
    if(p==='/api/admin/materiais-2027/acompanhamento'){
      if(method!=='GET')error('Método não permitido.',405);
      const allowed=new Set(['page','pageSize','name']);for(const k of u.searchParams.keys())if(!allowed.has(k)||u.searchParams.getAll(k).length!==1)error('Filtro de acompanhamento inválido.');
      const number=(key,defaultValue,max)=>{const raw=u.searchParams.get(key);if(raw===null)return defaultValue;if(!/^[1-9]\d*$/.test(raw))error('Paginação inválida.');return integer(Number(raw),1,max,'Paginação');};
      const page=number('page',1,100000),pageSize=number('pageSize',25,50),name=text(u.searchParams.get('name')||'',150),list=await materialList();
      const dancers=(await ds()).items.filter(d=>d.status!=='Inativo').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      const totals=list.items.map(i=>({itemId:i.id,yes:0,no:0,notInformed:0})),matching=dancers.filter(d=>!name||d.name.toLocaleLowerCase('pt-BR').includes(name.toLocaleLowerCase('pt-BR'))),selected=matching.slice((page-1)*pageSize,page*pageSize),selectedIds=new Set(selected.map(d=>d.id)),rows=[];
      for(const d of dancers){const answers=await materialAnswers(d.id),responses=list.items.map((i,index)=>{const response=materialResponse(answers,i.id);totals[index][response.hasMaterial===true?'yes':response.hasMaterial===false?'no':'notInformed']++;return {itemId:i.id,...response};});if(selectedIds.has(d.id))rows.push({dancerId:d.id,name:d.name,responses});}
      return send(res,200,{year:2027,listVersion:list.version,items:list.items,rows,totals,population:'Cadastros Pendente e Aprovado; Inativo e excluídos não contam. Totais de todos os elegíveis, independentes do filtro e da página.',totalDancers:dancers.length,matchedDancers:matching.length,page,pageSize});
    }
    if(p==='/api/admin/materiais-2027'||p==='/api/dancarinos/materiais-2027'){
      const isWrite=p==='/api/admin/materiais-2027'&&method==='PUT';
      if(method!=='GET'&&!isWrite)error('Método não permitido.',405);
      const previous=await materialList();
      if(!isWrite)return send(res,200,previous);
      const b=await readBody(req);fields(b,['items','version']);integer(b.version,0,Number.MAX_SAFE_INTEGER-1,'Versão');if(b.version!==previous.version)error('Materiais alterados em outra sessão. Atualize antes de salvar.',409);
      if(!Array.isArray(b.items)||b.items.length>200)error('Informe até 200 materiais.');
      const ids=new Set();const items=b.items.map(i=>{fields(i,['id','name','quantity','unit','notes']);let id;if(Object.hasOwn(i,'id')){if(typeof i.id!=='string'||!UUID.test(i.id)||!previous.items.some(old=>old.id===i.id)||ids.has(i.id))error('ID de material inválido, repetido ou removido. Atualize a lista.');id=i.id;}else id=crypto.randomUUID();ids.add(id);return {id,...preservePresentation(previous.items.find(old=>old.id===id),{name:text(i.name,150,true),quantity:integer(i.quantity,1,100000,'Quantidade'),unit:text(i.unit,40,true),notes:text(i.notes,1000)})};});
      if(Buffer.byteLength(JSON.stringify(items))>1024*1024)error('Lista excede 1 MiB.',413);
      const clean={year:2027,items,version:b.version+1,updatedAt:new Date().toISOString()};await store.set(KEYS.materials,clean);return send(res,200,clean);
    }
    if(method==='GET'&&p==='/api/diretoria')return send(res,200,{groups:await load(KEYS.board,board())});
    if(method==='POST'&&p==='/api/dancarinos/cadastro'){
      const b=await readBody(req);fields(b,['name','birth','phone','city','email','password','cpf','rgSameAsCpf','rg','photo','experience','message','consent','guardian','requestId']);if(b.consent!==true)error('Consentimento obrigatório.');if(!UUID.test(b.requestId))error('requestId deve ser UUID.');const clean=profile(b),pass=password(b.password),payload={...clean,password:pass,consent:true};const data=await ds();const previous=await receipt(data.receipts,b.requestId,payload);if(previous)return send(res,201,previous);unique(data.items,clean);const id=crypto.randomUUID(),response={id,message:'Cadastro recebido. Aguarde a organização.'};data.items.push({...clean,id,joinedAt:new Date().toISOString(),status:'Pendente',...await credentials(pass)});data.receipts.push({requestId:b.requestId,...await credentials(canonical(payload)),response});await store.set(KEYS.dancers,data);return send(res,201,response);
    }
    if(method==='POST'&&p==='/api/dancarinos/entrar'){
      const b=await readBody(req);const data=await ds();const d=data.items.find(d=>d.email===String(b.email||'').trim().toLowerCase());const candidate=typeof b.password==='string'&&b.password.length>=8&&b.password.length<=256?b.password:'';const salt=d?d.salt:'00'.repeat(32);const hash=await digest(candidate,salt);if(!d||!secureEqual(hash,d.hash)||d.status==='Inativo')error('E-mail ou senha inválidos.',401);const previous=ownSession(req);if(previous)dancerSessions.delete(previous.id);if(dancerSessions.size>=10000)error('Serviço ocupado. Aguarde.',503);const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');dancerSessions.set(id,{dancerId:d.id,passwordHash:d.hash,csrf,expires:Date.now()+8*3600000});return send(res,200,{csrf,name:d.name},{'Set-Cookie':cookie(id,8*3600)});
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
    if(method==='PUT'&&p==='/api/dancarinos/perfil'){const b=await readBody(req);fields(b,['phone','city','photo','message']);const data=await ds(),d=data.items.find(d=>d.id===dancer.id);for(const k of Object.keys(b))d[k]=k==='phone'?phone(b[k]):k==='photo'?photo(b[k]):text(b[k],k==='city'?150:2000,k==='city');await store.set(KEYS.dancers,data);return send(res,200,{ok:true});}
    if(method==='PUT'&&p==='/api/dancarinos/senha'){const b=await readBody(req);fields(b,['currentPassword','password']);const pass=password(b.password);if(typeof b.currentPassword!=='string'||b.currentPassword.length<8||b.currentPassword.length>256||!secureEqual(await digest(b.currentPassword,dancer.salt),dancer.hash))error('Senha atual inválida.',403);const data=await ds(),d=data.items.find(d=>d.id===dancer.id);Object.assign(d,await credentials(pass));await store.set(KEYS.dancers,data);dancerSessions.get(own.id).passwordHash=d.hash;revoke(d.id,own.id);return send(res,200,{ok:true});}
    let match=p.match(/^\/api\/dancarinos\/faltas\/([^/]+)$/);
    if(method==='PUT'&&match){const b=await readBody(req);fields(b,['reason']);const meetings=await ms();let id;try{id=decodeURIComponent(match[1]);}catch{error('Identificador inválido.');}const m=meetings.find(m=>m.id+':'+dancer.id===id),a=m?.attendees.find(a=>a.dancerId===dancer.id);if(!a)error('Falta não encontrada.',404);if(a.status!=='Falta')error('Só é possível justificar sua própria falta.',403);a.reason=text(b.reason,2000);await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true});}
    if(method==='GET'&&p==='/api/admin/dancarinos'){const data=await ds(),meetings=await ms();return send(res,200,{items:data.items.map(d=>({...publicProfile(d),stats:stats(d.id,meetings)}))});}
    match=p.match(/^\/api\/admin\/dancarinos\/([^/]+)(\/senha)?$/);
    if(match&&['PUT','DELETE'].includes(method)){
      const data=await ds(),d=data.items.find(d=>d.id===match[1]);if(!d)error('Cadastro não encontrado.',404);
      if(method==='DELETE'&&!match[2]){mp.assertEditable(await load(KEYS.finance,{plans:[]}),d.id);const meetings=await ms();for(const m of meetings){if(m.attendees.some(a=>a.dancerId===d.id))revokeCheckin(m);m.attendees=m.attendees.filter(a=>a.dancerId!==d.id);}await store.set(KEYS.meetings,meetings);data.items=data.items.filter(x=>x.id!==d.id);await store.set(KEYS.dancers,data);await store.set('members_trajetoria_v1_'+d.id,{items:[],version:0});await store.set(materialAnswersKey(d.id),{responses:{}});revoke(d.id);return send(res,200,{ok:true});}
      if(method==='PUT'){const b=await readBody(req);if(match[2]){fields(b,['password']);Object.assign(d,await credentials(password(b.password)));await store.set(KEYS.dancers,data);revoke(d.id);return send(res,200,{ok:true});}fields(b,['name','birth','phone','city','email','cpf','rgSameAsCpf','rg','photo','experience','message','guardian','status']);const clean=profile({...d,...b});unique(data.items,clean,d.id);const status=b.status??d.status;if(!['Pendente','Aprovado','Inativo'].includes(status))error('Status inválido.');Object.assign(d,clean,{status});await store.set(KEYS.dancers,data);if(status==='Inativo')revoke(d.id);return send(res,200,{ok:true});}
    }
    if(method==='GET'&&p==='/api/admin/encontros')return send(res,200,{items:(await ms()).map(adminMeeting)});
    if(method==='POST'&&p==='/api/admin/encontros'){
      const b=await readBody(req);fields(b,['type','title','date','closed','dancerIds']);if(!['Ensaio','Apresentação'].includes(b.type)||b.closed!==false)error('Tipo inválido ou encontro deve iniciar aberto.');if(!Array.isArray(b.dancerIds)||b.dancerIds.length>2000||new Set(b.dancerIds).size!==b.dancerIds.length)error('Seleção inválida.');const dancers=(await ds()).items;if(b.dancerIds.some(id=>!dancers.some(d=>d.id===id&&d.status!=='Inativo')))error('Seleção contém cadastro inelegível.');const m={id:crypto.randomUUID(),type:b.type,title:text(b.title,150,true),date:meetingDate(b.date),closed:false,attendees:b.dancerIds.map(dancerId=>({dancerId,status:'Pendente',reason:''}))};const meetings=await ms();meetings.push(m);await store.set(KEYS.meetings,meetings);return send(res,201,{id:m.id});
    }
    match=p.match(/^\/api\/admin\/encontros\/([^/]+)$/);
    if(match&&['PUT','DELETE'].includes(method)){let meetings=await ms();const m=meetings.find(m=>m.id===match[1]);if(!m)error('Encontro não encontrado.',404);if(method==='DELETE')meetings=meetings.filter(x=>x.id!==m.id);else {const b=await readBody(req);fields(b,['title','date','closed','attendees']);if(typeof b.closed!=='boolean'||!Array.isArray(b.attendees)||b.attendees.length>2000)error('Encontro inválido.');const dancers=(await ds()).items,seen=new Set();const attendees=b.attendees.map(a=>{fields(a,['dancerId','status','reason']);if(seen.has(a.dancerId)||!dancers.some(d=>d.id===a.dancerId&&(d.status!=='Inativo'||m.attendees.some(old=>old.dancerId===d.id)))||!['Pendente','Presente','Falta'].includes(a.status))error('Presença inválida.');seen.add(a.dancerId);const previous=m.attendees.find(old=>old.dancerId===a.dancerId);const record={...previous,dancerId:a.dancerId,status:a.status,reason:text(a.reason??'',2000)};if(!previous||previous.status!==a.status){if(previous?.source)record.previousRecord={status:previous.status,source:previous.source,recordedAt:previous.recordedAt??null};record.source='admin';record.recordedAt=new Date().toISOString();}return record;});const nextDate=meetingDate(b.date,b.closed),nextTitle=text(b.title,150,true);if(b.closed||m.date!==nextDate||m.attendees.length!==attendees.length||m.attendees.some(old=>!seen.has(old.dancerId)))revokeCheckin(m);Object.assign(m,{title:nextTitle,date:nextDate,closed:b.closed,attendees});}await store.set(KEYS.meetings,meetings);return send(res,200,{ok:true});}
    if(method==='POST'&&p==='/api/pedidos'){
      const b=await readBody(req);fields(b,['name','phone','size','quantity','consent','requestId']);if(b.consent!==true||!UUID.test(b.requestId))error('Consentimento e requestId UUID obrigatórios.');if(!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>20)error('Quantidade deve ser um inteiro entre 1 e 20.');const payload={name:text(b.name,150,true),phone:phone(b.phone),size:text(b.size,12,true),quantity:b.quantity,consent:true};const data=await os(),previous=await receipt(data.receipts,b.requestId,payload);if(previous)return send(res,201,previous);const shirt=getContent()?.shirt;if(!shirt||!Array.isArray(shirt.sizes)||!shirt.sizes.includes(payload.size)||typeof shirt.price!=='number'||!Number.isFinite(shirt.price)||shirt.price<=0||shirt.price>100000)error('Tamanho ou preço indisponível.');const unitPrice=Math.round(shirt.price*100)/100,total=Math.round(unitPrice*100)*payload.quantity/100;const id=crypto.randomUUID(),response={id,unitPrice,total,message:'Pedido registrado. Confirme a retirada com a organização.'};data.items.push({id,name:payload.name,phone:payload.phone,size:payload.size,quantity:payload.quantity,unitPrice,total,createdAt:new Date().toISOString(),status:'Recebido'});data.receipts.push({requestId:b.requestId,...await credentials(canonical(payload)),response});await store.set(KEYS.orders,data);return send(res,201,response);
    }
    if(method==='GET'&&p==='/api/admin/pedidos')return send(res,200,{items:(await os()).items});
    match=p.match(/^\/api\/admin\/pedidos\/([^/]+)$/);
    if(match&&['PUT','DELETE'].includes(method)){const data=await os(),o=data.items.find(o=>o.id===match[1]);if(!o)error('Pedido não encontrado.',404);if(method==='DELETE')data.items=data.items.filter(x=>x.id!==o.id);else {const b=await readBody(req);fields(b,['status']);if(!['Recebido','Em preparação','Pronto para retirada','Entregue','Cancelado'].includes(b.status))error('Status inválido.');o.status=b.status;}await store.set(KEYS.orders,data);return send(res,200,{ok:true});}
    if(method==='PUT'&&p==='/api/admin/diretoria'){
      const b=await readBody(req);fields(b,['groups']);if(!Array.isArray(b.groups)||b.groups.length!==GROUPS.length)error('Informe os cinco grupos fixos.');const keys=new Set();let photos=0;const groups=GROUPS.map(([key,title])=>{const g=b.groups.find(g=>g&&g.key===key);fields(g,['key','title','items']);if(keys.has(g.key)||g.title!==title||!Array.isArray(g.items)||g.items.length>30)error('Grupo inválido.');keys.add(key);return {key,title,items:g.items.map(i=>{fields(i,['name','role','description','photo']);const p=photo(i.photo??'',false);photos+=p.length;return {name:text(i.name,150,true),role:text(i.role,150,true),description:text(i.description??'',1500),photo:p};})};});if(photos>1500000)error('Imagens da diretoria excedem o limite total de 1,5 MB em base64.');await store.set(KEYS.board,groups);return send(res,200,{ok:true});
    }
    return send(res,404,{error:'Rota não encontrada.'});
  }
  return async function members(req,res,u){const p=u.pathname;if(!(p.startsWith('/api/dancarinos/')||p.startsWith('/api/admin/dancarinos')||p.startsWith('/api/admin/encontros')||p.startsWith('/api/admin/pedidos')||p==='/api/admin/diretoria'||p==='/api/admin/materiais-2027'||p==='/api/admin/materiais-2027/acompanhamento'||p==='/api/admin/pagamentos/status'||p==='/api/admin/pagamentos/links'||p==='/api/admin/contribuicao-2027'||p==='/api/admin/controle-inscricoes'||p==='/api/pagamentos/mercadopago/webhook'||p==='/api/pedidos'||p==='/api/diretoria'||p==='/api/patrocinadores'||p==='/api/patrocinadores/submissoes'||p==='/api/portfolio'||/^\/api\/admin\/(patrocinadores|portfolio)(\/[^/]+)?$/.test(p)))return false;try{if(req.method==='POST'&&['/api/dancarinos/cadastro','/api/dancarinos/entrar','/api/pedidos','/api/patrocinadores/submissoes'].includes(p)){origin(req);limit(req,p==='/api/dancarinos/entrar'?'login':p);}await serial(()=>route(req,res,u));}catch(e){if(!e.status)console.error('Falha na extensão de membros:',e.code||e.name);if(!res.headersSent&&!res.destroyed)send(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}return true;};
};
module.exports.displayText=displayText;
module.exports.displayProjection=displayProjection;
module.exports.preservePresentation=preservePresentation;
