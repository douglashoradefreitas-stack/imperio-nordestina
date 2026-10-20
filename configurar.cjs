'use strict';
// Cria ou redefine o único acesso administrativo — roda no Node.js, sem Python.
// Salva onde o servidor salva: banco externo (com DATABASE_URL) ou pasta local.
const fs=require('fs'),crypto=require('crypto');
const store=require('./store.cjs');
const TTY=Boolean(process.stdin.isTTY);
process.stdin.pause();

// Pergunta com senha oculta, usando modo raw do terminal (só quando interativo).
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
// Entrada não interativa (testes e automação): lê toda a entrada padrão de uma vez.
let piped=null;
function nextLine(label,hide){
  if(TTY)return hide?askHidden(label):askVisible(label);
  if(piped===null)piped=fs.readFileSync(0,'utf8').split(/\r?\n/);
  const value=piped.shift()??'';
  process.stdout.write(label+(hide?'***':''));
  process.stdout.write('\n');
  return Promise.resolve(value);
}
function stop(){process.stdout.write('')}
function exitWith(message){console.log('\n'+message);stop();process.exit(1)}

async function main(){
  console.log('Configurador do painel — Império Nordestina\n'+(store.mode==='db'?(process.env.DATABASE_URL?'(Armazenamento: banco de dados externo informado em DATABASE_URL.)':''):'(Armazenamento: pasta local "dados".)')+'\n');
  if(fs.existsSync(process.env.DATA_DIR?process.env.DATA_DIR+'/acesso.json':__dirname+'/dados/acesso.json')&&store.mode==='file'){
    console.log('Este procedimento redefine o acesso. Reinicie o servidor após concluir.');
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
  stop();
  console.log('\nAcesso criado. Inicie ou reinicie o servidor com: node server.cjs');
}
main().catch(error=>{console.error('Falha na configuração: '+error.message);process.exit(1)});
