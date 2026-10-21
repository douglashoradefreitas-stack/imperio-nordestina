'use strict';
// Checkout hospedado opcional. Nunca registra credenciais nem respostas brutas do provedor.
const crypto=require('crypto');
const net=require('net');
const API='https://api.mercadopago.com';
const FINANCE_KEY='members_financeiro_v1';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const numericId=v=>(typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v))||(Number.isSafeInteger(v)&&v>0);
function cents(value){
  if(typeof value!=='string'&&typeof value!=='number')return null;
  if(typeof value==='number'&&!Number.isFinite(value))return null;
  const m=String(value).match(/^(0|[1-9][0-9]{0,10})(?:\.([0-9]{1,2}))?$/);
  if(!m)return null;const result=Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));
  return Number.isSafeInteger(result)?result:null;
}
function publicBase(value){try{const u=new URL(value);const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.port&&u.port!=='443')||net.isIP(h)||!h.includes('.')||/(^|\.)(localhost|local|internal)$/.test(h))return null;return u.origin;}catch{return null;}}
function checkoutUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.mercadopago.com.br','www.mercadopago.com','sandbox.mercadopago.com.br','sandbox.mercadopago.com'].includes(u.hostname))return null;return u.href;}catch{return null;}}
function validSignature(req,u,secret,now=Date.now()){
  const ids=u.searchParams.getAll('data.id');if(ids.length!==1||!numericId(ids[0]))return false;
  const requestId=req.headers['x-request-id'],signature=req.headers['x-signature'];
  if(typeof requestId!=='string'||!requestId||requestId.length>200||/[;\r\n]/.test(requestId)||typeof signature!=='string'||signature.length>300)return false;
  const parts=signature.split(',').map(v=>v.trim().split('='));if(parts.length!==2||parts.some(p=>p.length!==2)||new Set(parts.map(p=>p[0])).size!==2)return false;
  const map=Object.fromEntries(parts);if(!/^\d{10,13}$/.test(map.ts||'')||!(/^[a-fA-F0-9]{64}$/).test(map.v1||''))return false;
  const timestamp=Number(map.ts)*(map.ts.length===10?1000:1);if(Math.abs(now-timestamp)>10*60*1000)return false;
  const manifest=`id:${ids[0]};request-id:${requestId};ts:${map.ts};`;
  const digest=crypto.createHmac('sha256',secret).update(manifest).digest();
  return crypto.timingSafeEqual(digest,Buffer.from(map.v1,'hex'));
}
module.exports=function createMercadoPago({store,readBody,fields,send,fetchImpl=globalThis.fetch,env=process.env}){
  // Captura configuração apenas no servidor. Não devolver valores em mensagens ou diagnóstico.
  const token=env.MP_ACCESS_TOKEN||'',secret=env.MP_WEBHOOK_SECRET||'',base=publicBase(env.APP_BASE_URL||'');
  const enabled=!!(token&&secret&&base);
  const status=()=>({enabled,provider:enabled?'Mercado Pago':null,status:enabled?'Checkout Pro configurado; homologação necessária':'Integração de pagamento pendente de configuração',message:enabled?'Pagamento hospedado no Mercado Pago. Valor enviado: somente base da parcela. Taxas a confirmar no checkout final.':'Checkout Pro indisponível até configuração segura do servidor.',fees:'Taxa a confirmar no checkout final',amountPolicy:'base_only'});
  const load=async()=>await store.get(FINANCE_KEY)??{plans:[]};
  async function request(path,method='GET',payload){
    try{
      const res=await fetchImpl(API+path,{method,redirect:'error',signal:AbortSignal.timeout(4000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
      if(!res.ok)fail('Mercado Pago indisponível para esta operação. Nenhum pagamento foi confirmado.',502);
      const value=await res.json();if(!value||typeof value!=='object'||Array.isArray(value))fail('Resposta inválida do Mercado Pago.',502);return value;
    }catch(e){if(e.status)throw e;fail('Não foi possível confirmar a resposta do Mercado Pago. Não repita uma criação incerta; procure a organização.',502);}
  }
  const attempts=data=>data.mpAttempts??=[];
  const outstanding=a=>a.state!=='approved';
  function assertEditable(data,dancerId){if((data.mpAttempts||[]).some(a=>a.dancerId===dancerId&&outstanding(a)))fail('Plano bloqueado por checkout em aberto ou criação incerta. Concilie com o Mercado Pago antes de alterar ou excluir o cadastro.',409);}
  function validatePreference(pref,a){
    if(typeof pref.id!=='string'||!pref.id||pref.id.length>200||pref.external_reference!==a.reference||!numericId(pref.collector_id)||!Array.isArray(pref.items)||pref.items.length!==1)fail('Preferência não confere com o registro interno.',422);
    const item=pref.items[0];if(item.currency_id!=='BRL'||item.quantity!==1||cents(item.unit_price)!==a.amountCents)fail('Valor ou moeda da preferência não confere.',422);
    if(pref.site_id!==undefined&&pref.site_id!=='MLB')fail('Preferência fora do site brasileiro.',422);
    if(a.preferenceId&&pref.id!==a.preferenceId)fail('Preferência divergente.',422);
    if(a.collectorId&&String(pref.collector_id)!==a.collectorId)fail('Conta recebedora divergente.',422);
    return String(pref.collector_id);
  }
  async function checkout(req,res,dancer){
    if(!enabled)fail('Integração de pagamento pendente de configuração.',503);
    const b=await readBody(req);fields(b,['installmentId','requestId']);
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(typeof b.installmentId!=='string'||!uuid.test(b.installmentId)||typeof b.requestId!=='string'||!uuid.test(b.requestId))fail('Identificadores inválidos.');
    const data=await load(),plan=data.plans.find(p=>p.dancerId===dancer.id),item=plan?.installments.find(i=>i.id===b.installmentId);
    if(!item)fail('Parcela não encontrada.',404);if(item.status!=='Pendente')fail('Parcela paga ou cancelada não permite checkout.',409);
    const all=attempts(data),used=all.find(a=>a.dancerId===dancer.id&&a.requestId===b.requestId);
    if(used&&used.installmentId!==item.id)fail('Tentativa já usada para outra parcela.',409);
    const previous=all.find(a=>a.dancerId===dancer.id&&a.installmentId===item.id);
    if(previous){
      if(previous.amountCents!==item.baseCents)fail('Checkout divergente; conciliação necessária.',409);
      if(previous.state!=='ready'||!checkoutUrl(previous.checkoutUrl))fail('Criação incerta ou pagamento em conciliação. Não será criada outra preferência.',409);
      return send(res,200,{checkoutUrl:previous.checkoutUrl,reused:true,amountCents:previous.amountCents});
    }
    const attempt={reference:crypto.randomBytes(32).toString('hex'),requestId:b.requestId,dancerId:dancer.id,installmentId:item.id,amountCents:item.baseCents,planVersion:plan.version,state:'creating',createdAt:new Date().toISOString()};
    all.push(attempt);await store.set(FINANCE_KEY,data);
    // Persistência ANTES do POST garante no máximo uma criação, inclusive após queda/timeout.
    // Não se presume suporte de idempotência remota no endpoint de preferências.
    try{
      const payload={items:[{id:attempt.reference,title:'Parcela da temporada 2027',quantity:1,currency_id:'BRL',unit_price:item.baseCents/100}],external_reference:attempt.reference,back_urls:{success:base+'/perfil?pagamento=retorno',pending:base+'/perfil?pagamento=retorno',failure:base+'/perfil?pagamento=retorno'},notification_url:base+'/api/pagamentos/mercadopago/webhook?source_news=ipn'};
      // Sem payer: CPF/RG, foto, responsável, nome e e-mail não saem deste sistema.
      const pref=await request('/checkout/preferences','POST',payload);
      attempt.collectorId=validatePreference(pref,attempt);const url=checkoutUrl(pref.init_point);
      if(!url)fail('Endereço de checkout não permitido.',502);
      attempt.preferenceId=pref.id;attempt.checkoutUrl=url;attempt.state='ready';await store.set(FINANCE_KEY,data);
      return send(res,200,{checkoutUrl:url,reused:false,amountCents:item.baseCents});
    }catch(e){attempt.state='uncertain';delete attempt.checkoutUrl;await store.set(FINANCE_KEY,data);throw e;}
  }
  async function webhook(req,res,u){
    if(req.method!=='POST')fail('Método não permitido.',405);
    if(!enabled)fail('Integração de pagamento pendente de configuração.',503);
    if(!validSignature(req,u,secret))fail('Assinatura inválida ou fora da janela de segurança.',401);
    const b=await readBody(req);const id=u.searchParams.get('data.id');
    if(b.type!=='payment'||u.searchParams.getAll('type').length>1||(u.searchParams.has('type')&&u.searchParams.get('type')!=='payment')||!b.data||String(b.data.id)!==id)fail('Notificação incompatível.',400);
    const payment=await request('/v1/payments/'+id);
    if(String(payment.id)!==id)fail('Pagamento divergente.',422);
    const data=await load(),a=(data.mpAttempts||[]).find(a=>a.reference===payment.external_reference);
    if(!a)return send(res,200,{ok:true}); // Evento não pertence a este sistema.
    if(!a.preferenceId||!a.collectorId)fail('Tentativa incerta exige conciliação antes da baixa.',409);
    if(payment.currency_id!=='BRL'||cents(payment.transaction_amount)!==a.amountCents||String(payment.collector_id)!==a.collectorId)fail('Pagamento não confere com moeda, valor ou recebedor.',422);
    const pref=await request('/checkout/preferences/'+encodeURIComponent(a.preferenceId));validatePreference(pref,a);
    if(!numericId(payment.order?.id))fail('Pagamento sem vínculo verificável com ordem comercial.',422);
    const order=await request('/merchant_orders/'+String(payment.order.id));
    if(String(order.id)!==String(payment.order.id)||order.preference_id!==a.preferenceId||order.external_reference!==a.reference||String(order.collector?.id)!==a.collectorId||!Array.isArray(order.payments)||!order.payments.some(p=>String(p.id)===id))fail('Ordem comercial ou preferência não confere.',422);
    const plan=data.plans.find(p=>p.dancerId===a.dancerId),item=plan?.installments.find(i=>i.id===a.installmentId);
    if(!item||item.baseCents!==a.amountCents)fail('Plano incompatível com a tentativa.',409);
    const now=new Date().toISOString();
    // Persistir financeiro e tentativa juntos: repetição de webhook não duplica a baixa.
    const previousPayment=a.payments?.[id];
    a.payments??={};a.payments[id]={status:String(payment.status||'unknown').slice(0,40),checkedAt:now};
    if(payment.status==='approved'&&cents(payment.transaction_amount_refunded??0)===0){
      if(item.status==='Pago'){
        if(item.payment?.source!=='mercadopago'||item.payment.paymentId!==id){a.reviewRequired=true;a.reviewReason='Pagamento adicional ou pagamento manual anterior; conferir no provedor.';}
      }else if(item.status==='Pendente'){
        item.status='Pago';item.payment={source:'mercadopago',amountCents:a.amountCents,note:'Aprovação consultada no Mercado Pago após webhook assinado.',recordedAt:now,paymentId:id,preferenceId:a.preferenceId};plan.version++;plan.updatedAt=now;
      }else fail('Parcela cancelada não admite baixa automática.',409);
      a.state='approved';
    }else if(['refunded','charged_back','in_mediation'].includes(payment.status)||(cents(payment.transaction_amount_refunded??0)??1)>0||previousPayment?.status==='approved'){
      a.reviewRequired=true;a.reviewReason='Reembolso, contestação ou mudança após aprovação: conciliação manual necessária.';
      // Não apagar histórico de recebimento nem inventar estorno/compensação contábil.
    }
    await store.set(FINANCE_KEY,data);return send(res,200,{ok:true});
  }
  const view=(data,dancerId)=>(data.mpAttempts||[]).filter(a=>a.dancerId===dancerId).map(a=>({installmentId:a.installmentId,state:a.state,reviewRequired:!!a.reviewRequired,message:a.reviewRequired?a.reviewReason:((a.state==='creating'||a.state==='uncertain')?'Criação incerta: conciliação com a organização necessária.':'Checkout vinculado. Aguardar confirmação do provedor.')}));
  return {status,checkout,webhook,assertEditable,view};
};
