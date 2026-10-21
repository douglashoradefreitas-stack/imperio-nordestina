'use strict';
// Cria ou redefine o único acesso administrativo — roda no Node.js, sem Python.
// Salva onde o servidor salva: banco externo (DATABASE_URL ou string informada aqui) ou pasta local.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const TTY=Boolean(process.stdin.isTTY);
const readline=require('node:readline');
const {Writable}=require('node:stream');
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback()}});
const terminal=TTY?readline.createInterface({input:process.stdin,output,terminal:true,historySize:0}):null;
let activeStore=null;
if(terminal)terminal.on('SIGINT',()=>{terminal.close();process.exit(130)});

function askHidden(label){
  return new Promise(resolve=>{
    process.stdout.write(label);
    process.stdin.setRawMode(true);process.stdin.resume();
    let value='';
    const handler=chunk=>{
      const char=chunk.toString('utf8');
      if(char==='\r'||char==='\n'){finish();return}
      if(char==='\u0003'){process.stdout.write('\n');process.exit(130)}
      if(char==='\b'||char==='\u007f'){if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b')}return}
      if(char>=' '){value+=char;process.stdout.write('*')}
    };
    const finish=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');process.stdin.removeListener('data',handler);resolve(value)};
    process.stdin.on('data',handler);
  });
}
function askVisible(label){
  return new Promise(resolve=>{
    process.stdout.write(label);
    let value='';
    const handler=chunk=>{const char=chunk.toString('utf8');if(char==='\r'||char==='\n'||char==='\n\r'){finish();return}if(char==='\u0003')process.exit(130);value+=char};
    const finish=()=>{process.stdin.removeListener('data',handler);process.stdout.write('\n');resolve(value)};
    process.stdin.resume();process.stdin.on('data',handler);
  });
}
let piped=null;
function nextLine(label,hide){
  if(TTY){
    process.stdout.write(label);
    muted=hide;
    return new Promise(resolve=>terminal.question('',answer=>{muted=false;if(hide)process.stdout.write('\n');resolve(answer)}));
  }
  if(piped===null)piped=fs.readFileSync(0,'utf8').split(/\r?\n/);
  const value=piped.shift()??'';
  process.stdout.write(label+(hide?'***':'')+'\n');
  return Promise.resolve(value);
}
function stop(){if(terminal)terminal.close()}
function exitWith(message){console.log('\n'+message);stop();process.exit(1)}

async function main(){
  console.log('Configurador do painel — Império Nordestina\n');
  let dburl=process.env.DATABASE_URL;
  if(!dburl){
    dburl=(await nextLine('Cole a connection string do Neon (ou aperte Enter para usar a pasta local): ',false)).trim();
    if(!dburl)console.log('\nSem banco externo: o acesso será salvo na pasta local "dados".\n');
  }
  if(dburl)process.env.DATABASE_URL=dburl;
  const store=require('./store.cjs');
  activeStore=store;
  const localFile=path.join(process.env.DATA_DIR||path.join(__dirname,'dados'),'acesso.json');
  if(store.mode==='file'&&fs.existsSync(localFile)){
    console.log('Este procedimento redefine o acesso local. Reinicie o servidor após concluir.');
    const confirm=(await nextLine('Digite REDEFINIR para continuar: ',false)).trim();
    if(confirm!=='REDEFINIR'){console.log('\nNenhuma alteração realizada.');stop();return}
  }
  const email=(await nextLine('E-mail para acessar o painel: ',false)).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))exitWith('E-mail inválido.');
const password=await nextLine('Crie uma senha com pelo menos 12 caracteres: ',true);
  if(password.length<12||password.length>256)exitWith('A senha precisa ter entre 12 e 256 caracteres.');
  const again=await nextLine('Repita a senha: ',true);
  if(again!==password)exitWith('As senhas não coincidem.');
  const salt=crypto.randomBytes(16);
  const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
  await store.set('acesso',{email,salt:salt.toString('hex'),hash});
  await store.close();
  stop();
  console.log('\nAcesso criado '+(store.mode==='db'?'no banco de dados.':'na pasta local.')+' Inicie ou reinicie o servidor com: node server.cjs');
}
main().catch(error=>{console.error('Falha na configuração: '+(error.message||error.code||'não foi possível conectar ao banco de dados. Verifique a connection string e tente de novo.'));process.exit(1)});
