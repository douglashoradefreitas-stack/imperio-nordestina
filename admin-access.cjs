'use strict';
// Contas administrativas separadas do cadastro dos dançarinos. Nenhum segredo é projetado.
const crypto=require('crypto'),{promisify}=require('util'),scrypt=promisify(crypto.scrypt);
const AREAS=Object.freeze({tema:'Tema do ano',camiseta:'Camiseta e Pix',destaques:'Destaques',eventos:'Eventos',patrocinadores:'Patrocinadores',portfolio:'Portfólio',contatos:'Contatos',historia:'História',diretoria:'Diretoria',dancarinos:'Cadastros de dançarinos e redefinição de suas senhas',presencas:'Presenças e justificativas',financeiro:'Financeiro e integração de pagamentos',controleinscricoes:'Controle de inscrições e recebimentos',materiais:'Materiais e acompanhamento',pedidos:'Pedidos e contato do comprador',trajetorias:'Moderação de trajetórias públicas'});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY='admin_accounts_v1',AUDIT='admin_audit_v1';
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
function fields(b,allowed){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))fail('Campo não permitido.');}
function password(p){if(typeof p!=='string'||p.length<6||p.length>256)fail('Senha deve ter entre 6 e 256 caracteres.');return p;}
function email(v){if(typeof v!=='string'||v.length>180)fail('E-mail inválido.');v=v.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail('E-mail inválido.');return v;}
function permissions(v){if(!Array.isArray(v)||v.length>Object.keys(AREAS).length||v.some(a=>typeof a!=='string'||!Object.hasOwn(AREAS,a))||new Set(v).size!==v.length)fail('Áreas inválidas.');return [...v].sort();}
const digest=async(p,salt)=>(await scrypt(p,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1})).toString('hex');
async function credentials(p){const salt=crypto.randomBytes(32).toString('hex');return {salt,hash:await digest(password(p),salt)};}
const nonce=()=>crypto.randomBytes(32).toString('hex');
function areaFor(path){
 if(path==='/api/admin/notificacoes/eventos'||/^\/api\/admin\/notificacoes\/eventos\/[^/]+\/avisar$/.test(path))return 'eventos';
 if(path==='/api/admin/destaques/perfis')return 'destaques';
 if(/^\/api\/admin\/dancarinos\/[^/]+\/financeiro$/.test(path)||/^\/api\/admin\/pagamentos\/(status|links)$/.test(path)||path==='/api/admin/contribuicao-2027')return 'financeiro';
 if(/^\/api\/admin\/dancarinos(?:\/[^/]+(?:\/(?:senha|aprovacao))?)?$/.test(path))return 'dancarinos';
 const map=[['encontros','presencas'],['patrocinadores','patrocinadores'],['portfolio','portfolio'],['trajetorias','trajetorias'],['materiais-2027','materiais'],['pedidos','pedidos']];
 for(const [prefix,area]of map)if(path==='/api/admin/'+prefix||path.startsWith('/api/admin/'+prefix+'/'))return area;
 if(path==='/api/admin/diretoria'||/^\/api\/admin\/diretoria\/[^/]+\/portfolio$/.test(path))return 'diretoria';if(path==='/api/admin/controle-inscricoes')return 'controleinscricoes';return null;
}
module.exports=function createAdminAccess({store,send,secure=false}){
 const sessions=new Map(),rates=new Map();let tail=Promise.resolve();const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p};
 const accounts=async()=>await store.get(KEY)??{items:[],version:0};
 const cookie=(id,age)=>`imperio_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 function session(req){return req.admin||null;}
 function permitted(req,s){if(!s||!eq(req.headers['x-csrf-token']||'',s.csrf)||req.headers['sec-fetch-site']==='cross-site')return false;if(!req.headers.origin)return true;try{return new URL(req.headers.origin).origin===new URL((req.socket.encrypted?'https:':'http:')+'//'+req.headers.host).origin||new URL(req.headers.origin).host===req.headers.host}catch{return false}}
 function origin(req){if(req.headers['sec-fetch-site']==='cross-site')fail('Origem não autorizada.',403);if(req.headers.origin){try{if(new URL(req.headers.origin).host===req.headers.host)return}catch{}fail('Origem não autorizada.',403);}}
 function limit(req,kind,max=8){const now=Date.now();for(const[k,v]of rates)if(v.until<=now)rates.delete(k);const key=kind+':'+(req.socket.remoteAddress||'unknown');let r=rates.get(key);if(!r){if(rates.size>=10000)fail('Serviço ocupado. Aguarde.',429);r={count:0,until:now+15*60000};rates.set(key,r);}if(++r.count>max)fail('Muitas tentativas. Aguarde 15 minutos.',429);return key;}
 async function authenticate(req){
  req.admin=null;const c=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('imperio_session=')),id=c?.slice(16),s=sessions.get(id);if(!s||s.expires<=Date.now()){if(s)sessions.delete(id);return null;}
  let a,isPrincipal=s.kind==='principal';
  if(isPrincipal){a=await store.get('acesso');if(!a||a.hash!==s.hash||String(a.email).trim().toLowerCase()!==s.email){sessions.delete(id);return null;}}
  else if(s.kind==='delegado'){a=(await accounts()).items.find(a=>a.id===s.accountId);if(!a||a.active!==true||a.version!==s.version||a.hash!==s.hash||a.role!=='delegado'||!Array.isArray(a.permissions)||a.permissions.some(k=>!Object.hasOwn(AREAS,k))){sessions.delete(id);return null;}}
  else{sessions.delete(id);return null;}
  return req.admin={id,accountId:isPrincipal?'principal':a.id,email:a.email,isPrincipal,permissions:isPrincipal?Object.keys(AREAS):[...a.permissions],csrf:s.csrf,version:a.version||0};
 }
 function has(s,area){return !!s&&(s.isPrincipal===true||s.permissions.includes(area));}
 async function authorize(req,path){const s=await authenticate(req);if(!s)fail('Entre para acessar o painel.',401);if(!['GET','HEAD'].includes(req.method)&&!permitted(req,s))fail('Token administrativo ou origem inválidos.',403);
  if(path==='/api/admin/minha-senha')return s;
  if(path==='/api/admin/acessos'||path.startsWith('/api/admin/acessos/')){if(!s.isPrincipal)fail('Somente o administrador principal gerencia acessos.',403);return s;}
  if(path==='/api/admin/participantes'){const u=new URL(req.url,'http://localhost'),area=u.searchParams.get('area');if(req.method!=='GET'||!['financeiro','presencas'].includes(area)||[...u.searchParams.keys()].some(k=>k!=='area')||u.searchParams.getAll('area').length!==1||!has(s,area))fail('Área não autorizada.',403);return s;}
  const area=areaFor(path);if(!area||!has(s,area))fail('Área não autorizada.',403);return s;
 }
 const view=s=>({email:s.email,isPrincipal:s.isPrincipal,permissions:[...s.permissions],csrf:s.csrf});
 const safe=a=>({id:a.id,email:a.email,active:a.active,permissions:[...a.permissions],version:a.version,createdAt:a.createdAt,updatedAt:a.updatedAt});
 function revoke(accountId,except){for(const[k,s]of sessions)if((s.kind==='principal'?'principal':s.accountId)===accountId&&k!==except)sessions.delete(k);}
 async function audit(action,actor,target){const a=await store.get(AUDIT)??{items:[]};a.items.push({id:crypto.randomUUID(),action,actor:actor.accountId,target,at:new Date().toISOString()});a.items=a.items.slice(-1000);await store.set(AUDIT,a);}
 async function read(req){if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))fail('Envie JSON.',415);let size=0,parts=[];for await(const b of req){size+=b.length;if(size<=8192)parts.push(b);}if(size>8192)fail('Corpo acima de 8 KiB.',413);try{const b=JSON.parse(Buffer.concat(parts));if(!b||typeof b!=='object'||Array.isArray(b))fail('JSON inválido.');return b}catch{fail('JSON inválido.');}}
 async function handle(req,res,u){const p=u.pathname,method=req.method;if(!['/api/entrar','/api/sessao','/api/sair','/api/admin/minha-senha','/api/admin/acessos','/api/admin/acessos/auditoria'].includes(p)&&!/^\/api\/admin\/acessos\/[^/]+(?:\/senha)?$/.test(p))return false;
  await serial(async()=>{try{
   if(p==='/api/entrar'){
    if(method!=='POST')fail('Método não permitido.',405);origin(req);const key=limit(req,'login'),b=await read(req);fields(b,['email','password']);if(typeof b.password!=='string'||b.password.length<6||b.password.length>256)fail('E-mail ou senha inválidos.',401);
    const address=typeof b.email==='string'?b.email.trim().toLowerCase():'',principal=await store.get('acesso'),data=await accounts();let a=null,kind='delegado';if(principal&&address===String(principal.email).trim().toLowerCase()){a=principal;kind='principal';}else a=data.items.find(a=>a.email===address&&a.active===true&&a.role==='delegado');
    const salt=a?.salt||'00'.repeat(32),hash=await digest(b.password,salt);if(!a||!eq(hash,a.hash))fail('E-mail ou senha inválidos.',401);
    const old=await authenticate(req);if(old)sessions.delete(old.id);if(sessions.size>=10000)fail('Limite de sessões atingido.',429);const id=nonce();sessions.set(id,{kind,accountId:a.id,email:address,version:a.version||0,hash:a.hash,csrf:nonce(),expires:Date.now()+8*3600000});rates.delete(key);req.headers.cookie='imperio_session='+id;const s=await authenticate(req);return send(res,200,view(s),{'Set-Cookie':cookie(id,8*3600)});
   }
   if(p==='/api/sessao'){if(method!=='GET')fail('Método não permitido.',405);const s=await authenticate(req);if(!s)fail('Entre para acessar o painel.',401);return send(res,200,view(s));}
   if(p==='/api/sair'){if(method!=='POST')fail('Método não permitido.',405);const s=await authenticate(req);if(!s||!permitted(req,s))fail('Sessão inválida.',403);sessions.delete(s.id);req.admin=null;return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
   const s=await authorize(req,p);if(u.search)fail('Parâmetros não permitidos.');
   if(p==='/api/admin/minha-senha'){
    if(method!=='PUT')fail('Método não permitido.',405);limit(req,'senha:'+s.accountId);const b=await read(req);fields(b,['currentPassword','password','confirmation']);password(b.password);if(b.confirmation!==b.password)fail('As senhas não coincidem.');if(typeof b.currentPassword!=='string'||b.currentPassword.length<6||b.currentPassword.length>256)fail('Senha atual inválida.',403);
    const data=s.isPrincipal?null:await accounts(),a=s.isPrincipal?await store.get('acesso'):data.items.find(a=>a.id===s.accountId);if(!eq(await digest(b.currentPassword,a.salt),a.hash))fail('Senha atual inválida.',403);
    Object.assign(a,await credentials(b.password));a.version=(a.version||0)+1;a.updatedAt=new Date().toISOString();if(s.isPrincipal)await store.set('acesso',a);else{data.version++;await store.set(KEY,data);}revoke(s.accountId,s.id);const stored=sessions.get(s.id);stored.hash=a.hash;stored.version=a.version;stored.csrf=nonce();await audit('trocar-propria-senha',s,s.accountId);await authenticate(req);return send(res,200,{ok:true,...view(req.admin)});
   }
   if(p==='/api/admin/acessos/auditoria'){if(method!=='GET')fail('Método não permitido.',405);return send(res,200,await store.get(AUDIT)??{items:[]});}
   const data=await accounts();
   if(p==='/api/admin/acessos'){
    if(method==='GET')return send(res,200,{items:data.items.map(safe),areas:AREAS,version:data.version});
    if(method!=='POST')fail('Método não permitido.',405);const b=await read(req);fields(b,['email','password','permissions','active']);const address=email(b.email),allowed=permissions(b.permissions);if(typeof b.active!=='boolean')fail('Situação inválida.');password(b.password);if(data.items.length>=100)fail('Limite de 100 administradores.',409);const primary=await store.get('acesso');if(address===String(primary.email).trim().toLowerCase()||data.items.some(a=>a.email===address))fail('E-mail administrativo já cadastrado.',409);
    const now=new Date().toISOString(),a={id:crypto.randomUUID(),email:address,...await credentials(b.password),role:'delegado',permissions:allowed,active:b.active,version:1,createdAt:now,updatedAt:now};data.items.push(a);data.version++;await store.set(KEY,data);await audit('criar-acesso',s,a.id);return send(res,201,safe(a));
   }
   const m=p.match(/^\/api\/admin\/acessos\/([^/]+)(\/senha)?$/);if(!m||!UUID.test(m[1]))fail('Administrador não encontrado.',404);const a=data.items.find(a=>a.id===m[1]);if(!a)fail('Administrador não encontrado.',404);
   if(method==='DELETE'&&!m[2]){const b=await read(req);fields(b,['version']);if(b.version!==a.version)fail('Acesso alterado. Recarregue.',409);data.items=data.items.filter(x=>x.id!==a.id);data.version++;await store.set(KEY,data);revoke(a.id);await audit('excluir-acesso',s,a.id);return send(res,200,{ok:true});}
   if(method!=='PUT')fail('Método não permitido.',405);const b=await read(req);
   if(m[2]){fields(b,['password','version']);password(b.password);}else{fields(b,['permissions','active','version']);permissions(b.permissions);if(typeof b.active!=='boolean')fail('Situação inválida.');}
   if(b.version!==a.version)fail('Acesso alterado. Recarregue.',409);if(m[2])Object.assign(a,await credentials(b.password));else{a.permissions=permissions(b.permissions);a.active=b.active;}a.version++;a.updatedAt=new Date().toISOString();data.version++;await store.set(KEY,data);revoke(a.id);await audit(m[2]?'redefinir-senha':'alterar-areas-situacao',s,a.id);return send(res,200,safe(a));
  }catch(e){if(!e.status)console.error('Falha administrativa:',e.code||e.name);if(!res.headersSent&&!res.destroyed)send(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir.'});}});return true;
 }
 const timer=setInterval(()=>{const now=Date.now();for(const[k,s]of sessions)if(s.expires<=now)sessions.delete(k);for(const[k,v]of rates)if(v.until<=now)rates.delete(k)},60000);timer.unref();
 return {handle,session,authenticate,authorize,permitted,has,areas:AREAS};
};
module.exports.areaFor=areaFor;
