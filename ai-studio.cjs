'use strict';
// Assistente de criação (IA) para administradores: redigir mensagens e sugerir montagem de imagem.
// As chaves existem apenas em variáveis de ambiente do servidor (Render); nunca via interface,
// nunca em respostas, logs ou erros. Nenhuma conversa ou imagem é armazenada; o log guarda
// somente data, administrador, modo e resultado. Sem dependências novas: fetch nativo do Node 22.
const AREA='ia';
const BODY_MAX=4000;
const RATE_MAX=20,RATE_WINDOW=60*60*1000;
const TIMEOUT=Number(process.env.AI_TIMEOUT_MS)>0?Number(process.env.AI_TIMEOUT_MS):25000;
const TONALIDADES=Object.freeze(['festiva','formal','urgente']);
const DIRETRIZ='Você é o assistente de comunicação da Império Nordestina, um grupo de quadrilha junina. Escreva em português do Brasil, textos curtos e prontos para uso em WhatsApp, e-mail ou redes sociais, sem emojis e sem markdown. Mantenha o tom pedido pelo administrador e o nome Império Nordestina quando fizer sentido. Não invente datas, endereços, preços ou nomes: quando a informação não vier nas instruções, use um espaço entre colchetes, por exemplo [data].';
const DIRETRIZ_MONTAGEM='Você é o diretor de arte da Império Nordestina, um grupo de quadrilha junina. Recebe instruções e devolve UM prompt detalhado para ferramentas de geração de imagem, descrevendo composição, paleta do site (azul-marinho #0b1420, azul-escuro #111e2d, dourado #d9ae65), elementos juninos (bandeirinhas, chapéu de couro, vestido de chita, fogueira estilizada), iluminação e espaço reservado para o texto do cartaz. Responda com dois blocos, nesta ordem, sem markdown: "PT: <prompt em português>" e "EN: <prompt em inglês>".';
function config(){
 const openaiKey=typeof process.env.OPENAI_API_KEY==='string'?process.env.OPENAI_API_KEY.trim():'';
 const geminiKey=(typeof process.env.GEMINI_API_KEY==='string'?process.env.GEMINI_API_KEY.trim():'')||(typeof process.env.GOOGLE_API_KEY==='string'?process.env.GOOGLE_API_KEY.trim():'');
 let openaiBase=String(process.env.OPENAI_BASE_URL||'').trim().replace(/\/+$/,'');
 if(!/^https:\/\//.test(openaiBase))openaiBase='';
 return {openai:{key:openaiKey,base:openaiBase||'https://api.openai.com/v1',texto:process.env.OPENAI_TEXT_MODEL||'gpt-4o-mini',imagem:process.env.OPENAI_IMAGE_MODEL||'gpt-image-1'},gemini:{key:geminiKey,texto:process.env.GEMINI_TEXT_MODEL||'gemini-2.0-flash',imagem:process.env.GEMINI_IMAGE_MODEL||'gemini-2.0-flash-preview-image-generation'}};
}
function falha(message,status=400){const e=new Error(message);e.status=status;throw e}
function instrucao(value,campo){
 if(typeof value!=='string')falha('Descreva o que o assistente deve fazer.');
 const t=value.trim();
 if(!t)falha('Descreva o que o assistente deve fazer.');
 if(t.length>BODY_MAX)falha('Texto acima do limite de 4000 caracteres.');
 return t;
}
function semChave(){falha('Nenhum provedor de IA está configurado no servidor. Configure OPENAI_API_KEY ou GEMINI_API_KEY no Render.',503)}
async function upstream(url,options){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);
 try{return await fetch(url,{...options,signal:controller.signal})}
 catch(e){if(e&&e.name==='AbortError')falha('O provedor de IA não respondeu a tempo. Tente novamente.',504);falha('O provedor de IA não pôde ser contatado. Tente novamente.',502)}
 finally{clearTimeout(timer)}
}
async function resposta(r){
 let data;try{data=await r.json()}catch{falha('O provedor de IA respondeu em formato inesperado. Tente novamente.',502)}
 if(!r.ok)falha('O provedor de IA recusou a solicitação. Verifique a chave, o modelo e os limites da conta.',502);
 return data;
}
function textoPlano(data,procurar){
 const partes=Array.isArray(data?.candidates?.[0]?.content?.parts)?data.candidates[0].content.parts:[];
 const texto=partes.map(p=>typeof p?.text==='string'?p.text:'').join('\n').trim();
 if(texto)return texto;
 falha('O provedor de IA não devolveu texto. Tente novamente.',502);
}
async function chat(provedor,b){
 const cfg=config();
 const instrucoes=instrucao(b.instrucoes);
 const tonalidade=TONALIDADES.includes(b.tonalidade)?b.tonalidade:'festiva';
 const montagem=b.acao==='montagem';
 const pergunta=(montagem?'Sugerir montagem de imagem. ':'Escrever mensagem. ')+(b.tonalidade&&tonalidade?'Tom '+tonalidade+'. ':'')+instrucoes;
 let texto;
 if(provedor==='openai'){
  const r=await upstream(cfg.openai.base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.openai.key},body:JSON.stringify({model:cfg.openai.texto,messages:[{role:'system',content:montagem?DIRETRIZ_MONTAGEM:DIRETRIZ},{role:'user',content:pergunta}],max_tokens:1200,temperature:0.8})});
  const data=await resposta(r);const bruto=data?.choices?.[0]?.message?.content;texto=typeof bruto==='string'?bruto.trim():'';
  if(!texto)falha('O provedor de IA não devolveu texto. Tente novamente.',502);
 }else{
  const r=await upstream('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(cfg.gemini.texto)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':cfg.gemini.key},body:JSON.stringify({systemInstruction:{parts:[{text:montagem?DIRETRIZ_MONTAGEM:DIRETRIZ}]},contents:[{role:'user',parts:[{text:pergunta}]}],generationConfig:{temperature:0.8,maxOutputTokens:1200}})});
  texto=textoPlano(await resposta(r));
 }
 return {ok:true,texto};
}
async function imagem(provedor,b){
 const cfg=config();
 const instrucoes=typeof b.instrucoes==='string'?b.instrucoes.trim().slice(0,BODY_MAX):'';
 const promptSalvo=typeof b.prompt==='string'&&b.prompt.trim()?b.prompt.trim().slice(0,6000):'';
 const base=promptSalvo||instrucao(b.instrucoes);
 let imagem;
 if(provedor==='openai'){
  const r=await upstream(cfg.openai.base+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.openai.key},body:JSON.stringify({model:cfg.openai.imagem,prompt:base,n:1,size:'1024x1024'})});
  const data=await resposta(r);const b64=data?.data?.[0]?.b64_json;
  if(typeof b64!=='string'||!b64)falha('O provedor de IA não devolveu imagem. Tente novamente.',502);
  imagem='data:image/png;base64,'+b64;
 }else{
  const r=await upstream('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(cfg.gemini.imagem)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':cfg.gemini.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:base+'\nCrie a imagem descrita.'}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}})});
  const data=await resposta(r);const partes=Array.isArray(data?.candidates?.[0]?.content?.parts)?data.candidates[0].content.parts:[];const parte=partes.find(p=>p&&p.inlineData&&typeof p.inlineData.data==='string');
  if(!parte)falha('O provedor de IA não devolveu imagem. Tente novamente.',502);
  imagem='data:'+(typeof parte.inlineData.mimeType==='string'?parte.inlineData.mimeType:'image/png')+';base64,'+parte.inlineData.data;
 }
 return {ok:true,imagem,prompt:base};
}
async function lerCorpo(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))falha('Envie JSON.',415);
 let size=0,partes=[];
 for await(const parte of req){size+=parte.length;if(size>16384)falha('Corpo acima do limite.',413);partes.push(parte)}
 let b;try{b=JSON.parse(Buffer.concat(partes).toString())}catch{falha('JSON inválido.')}
 if(!b||typeof b!=='object'||Array.isArray(b))falha('JSON inválido.');
 return b;
}
module.exports=function createAiStudio({send,authenticate,permitted,has}){
 const rates=new Map();
 function limit(s){const now=Date.now();for(const[k,v]of rates)if(v.until<=now)rates.delete(k);let r=rates.get(s.accountId);if(!r){if(rates.size>=10000)falha('Serviço ocupado. Aguarde.',429);r={count:0,until:now+RATE_WINDOW};rates.set(s.accountId,r)}if(++r.count>RATE_MAX)falha('Limite de 20 solicitações por hora atingido. Aguarde.',429)}
 async function handle(req,res,u){
  const p=u.pathname;
  if(p!=='/api/admin/ai/chat'&&p!=='/api/admin/ai/image'&&p!=='/api/admin/ai/status')return false;
  const method=req.method;let s=null,modo=null;
  try{
   s=await authenticate(req);
   if(!s)falha('Entre para acessar o painel.',401);
   if(!['GET','HEAD'].includes(method)&&!permitted(req,s))falha('Token administrativo ou origem inválidos.',403);
   if(!has(s,AREA))falha('Área não autorizada.',403);
   if(u.search)falha('Parâmetros não permitidos.',400);
   const cfg=config();
   if(p==='/api/admin/ai/status'){
    if(method!=='GET')falha('Método não permitido.',405);
    return send(res,200,{ok:true,openai:{texto:!!cfg.openai.key,imagem:!!cfg.openai.key},gemini:{texto:!!cfg.gemini.key,imagem:!!cfg.gemini.key},imagemGeracao:!!(cfg.openai.key||cfg.gemini.key)});
   }
   if(method!=='POST')falha('Método não permitido.',405);
   const corpo=await lerCorpo(req);
   limit(s);
   modo=p==='/api/admin/ai/chat'?'chat':'imagem';
   const provedor=cfg.openai.key?'openai':cfg.gemini.key?'gemini':'';
   if(!provedor)semChave();
   const resultado=modo==='chat'?await chat(provedor,corpo):await imagem(provedor,corpo);
   console.log('ai-studio',new Date().toISOString(),s.accountId,modo,'ok');
   return send(res,200,resultado);
  }catch(e){
   const status=e.status||400;
   if(status>=500)console.error('Falha de IA:',e.code||e.name);
   console.log('ai-studio',new Date().toISOString(),s?s.accountId:'anônimo',modo||'desconhecido','falha');
   return send(res,status,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});
  }
 }
 return {handle};
};
module.exports.areaFor=AREA;
