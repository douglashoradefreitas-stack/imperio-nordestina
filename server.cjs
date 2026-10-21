'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname;
const PORT=Number(process.env.PORT||3000),SECURE=process.env.COOKIE_SECURE==='true';
const store=require('./store.cjs');
let content=null,account=null;
const sessions=new Map(),attempts=new Map();
const token=()=>crypto.randomBytes(32).toString('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const security={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function send(res,status,data,headers={}){const json=typeof data!=='string';res.writeHead(status,{...security,'Content-Type':json?'application/json; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store',...headers});res.end(json?JSON.stringify(data):data)}
function fail(message){const error=new Error(message);error.validation=true;throw error}
function body(req){return new Promise((resolve,reject)=>{let parts=[],size=0;req.on('data',b=>{size+=b.length;if(size>16*1024*1024){reject(new Error('too_large'));req.destroy();return}parts.push(b)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString()))}catch{reject(new Error('invalid_json'))}});req.on('error',reject)})}
function text(value,max=1000){if(typeof value!=='string'||value.length>max)fail('Texto inválido ou acima do limite.');return value.trim()}
function image(value){const s=text(value,3000000);if(!s)return '';const m=s.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)fail('Use imagens PNG, JPG ou WebP.');const bytes=Buffer.from(m[2],'base64');const good=m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!good)fail('Arquivo de imagem inválido.');return s}
function validate(input){if(!input||typeof input!=='object'||Array.isArray(input))fail('Conteúdo inválido.');const c=input.contacts||{},t=input.theme||{},shirt=input.shirt||{};const phone=text(c.phone,16),instagram=text(c.instagram,40).replace(/^@/,'');if(!/^\d{12,15}$/.test(phone))fail('Informe o telefone com DDI e DDD, somente números.');if(!/^[\w.]+$/.test(instagram))fail('Usuário do Instagram inválido.');const email=text(c.email,180);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail inválido.');const price=shirt.price;if(typeof price!=='number'||!Number.isFinite(price)||price<=0||price>100000)fail('Preço inválido.');function list(value,max,fn){if(!Array.isArray(value)||value.length>max)fail('Quantidade de itens inválida.');return value.map(fn)}
return {historyTitle:text(input.historyTitle===undefined?(content?.historyTitle??''):input.historyTitle,150),history:text(input.history===undefined?(content?.history??''):input.history,12000),contacts:{phone,instagram,email,pix:text(c.pix,180)},theme:{title:text(t.title,150),description:text(t.description,2000),image:image(t.image)},shirt:{price,image:image(shirt.image),note:text(shirt.note,800),sizes:list(shirt.sizes,15,s=>text(s,12)).filter(Boolean)},highlights:list(input.highlights,3,h=>({role:text(h.role,40),name:text(h.name,150),description:text(h.description,800),image:image(h.image)})),events:list(input.events,30,e=>({title:text(e.title,150),date:text(e.date,30),location:text(e.location,180),description:text(e.description,1000)})),sponsors:list(input.sponsors,30,s=>({name:text(s.name,150),category:text(s.category,60),image:image(s.image)}))}}
function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('imperio_session='));const id=cookie?cookie.slice(16):'';const s=sessions.get(id);if(s&&s.expires>Date.now())return {id,...s};if(s)sessions.delete(id);return null}
function permitted(req,s){if(!s||!equal(req.headers['x-csrf-token']||'',s.csrf))return false;const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host}catch{return false}}
const cookie=(id,age)=>`imperio_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${SECURE?'; Secure':''}`;
const members=require('./members.cjs')({store,session,permitted,getContent:()=>content,send,secure:SECURE});
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const method=req.method;
if(await members(req,res,u))return;
if(method==='GET'&&u.pathname==='/api/conteudo')return send(res,200,content);
if(method==='GET'&&u.pathname==='/api/sessao'){const s=session(req);return s?send(res,200,{email:account.email,csrf:s.csrf}):send(res,401,{error:'Entre para acessar o painel.'})}
if(method==='POST'&&u.pathname==='/api/entrar'){
 const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return send(res,403,{error:'Origem não autorizada.'});
 const key=req.socket.remoteAddress||'desconhecido';let rate=attempts.get(key);if(!rate||rate.reset<Date.now()){rate={count:0,reset:Date.now()+15*60*1000};attempts.set(key,rate)}
 if(rate.count>=8)return send(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});rate.count++;
 const b=await body(req);if(typeof b.password!=='string'||b.password.length<12||b.password.length>256)return send(res,401,{error:'E-mail ou senha inválidos.'});
 const hash=crypto.scryptSync(b.password,Buffer.from(account.salt,'hex'),64,{N:16384,r:8,p:1}).toString('hex');
 if(String(b.email||'').trim().toLowerCase()!==account.email||!equal(hash,account.hash))return send(res,401,{error:'E-mail ou senha inválidos.'});
 const old=session(req);if(old)sessions.delete(old.id);const id=token(),csrf=token();sessions.set(id,{csrf,expires:Date.now()+8*3600000});attempts.delete(key);return send(res,200,{email:account.email,csrf},{'Set-Cookie':cookie(id,8*3600)});
}
if(method==='PUT'&&u.pathname==='/api/conteudo'){const s=session(req);if(!s)return send(res,401,{error:'Sua sessão terminou. Entre novamente.'});if(!permitted(req,s))return send(res,403,{error:'Atualize a página antes de salvar.'});const input=await body(req);const clean=validate(input);await store.set('conteudo',clean);content=clean;return send(res,200,{ok:true})}
if(method==='POST'&&u.pathname==='/api/sair'){const s=session(req);if(!s||!permitted(req,s))return send(res,403,{error:'Sessão inválida.'});sessions.delete(s.id);return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
if(method==='GET'&&/^\/assets\/portfolio\/(?:cultural-v1-202[0-5]|atividade-v2-(?:00[1-9]|0[1-7]\d|08[0-7]))\.webp$/.test(u.pathname)){try{const image=fs.readFileSync(path.join(ROOT,'public',u.pathname));res.writeHead(200,{...security,'Content-Type':'image/webp','Cache-Control':'public, max-age=86400'});return res.end(image)}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'Imagem não encontrada.'});throw e}}
if(method==='GET'&&['/','/admin','/admin/','/perfil','/perfil/','/diretoria','/diretoria/','/portfolio','/portfolio/'].includes(u.pathname)){const file=u.pathname==='/'?'index.html':u.pathname.startsWith('/admin')?'admin.html':u.pathname.startsWith('/perfil')?'perfil.html':u.pathname.startsWith('/portfolio')?'portfolio.html':'diretoria.html';try{return send(res,200,fs.readFileSync(path.join(ROOT,'public',file),'utf8'))}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'Página não encontrada.'});throw e}}
return send(res,404,{error:'Página não encontrada.'});
}catch(e){if(e.validation)return send(res,400,{error:e.message});if(e.message==='invalid_json')return send(res,400,{error:'Dados inválidos.'});console.error('Falha de processamento:',e.code||e.name);if(!res.headersSent&&!res.destroyed)send(res,500,{error:'Não foi possível concluir. Tente novamente.'})}});
server.requestTimeout=30000;server.headersTimeout=15000;
const cleanup=setInterval(()=>{const now=Date.now();for(const[k,s]of sessions)if(s.expires<now)sessions.delete(k);for(const[k,a]of attempts)if(a.reset<now)attempts.delete(k)},60000);cleanup.unref();
(async()=>{try{
  account=await store.get('acesso');
  if(!account||!account.email||!account.hash||!account.salt){console.error('Crie seu acesso primeiro: node configurar.cjs');process.exit(1)}
  content=await store.get('conteudo');
  if(!content){content=JSON.parse(fs.readFileSync(path.join(ROOT,'conteudo-inicial.json'),'utf8'));await store.set('conteudo',content)}
  server.listen(PORT,'0.0.0.0',()=>console.log('Site e painel iniciados na porta '+PORT+(store.mode==='db'?' (dados no banco externo)':'')));
}catch(e){console.error('Falha ao iniciar: '+(e.message||e));process.exit(1)}})();
