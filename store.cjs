'use strict';
// Camada de armazenamento: banco Postgres externo (deploy) ou pasta local (uso próprio).
const fs=require('fs'),path=require('path');
const url=process.env.DATABASE_URL;
let impl;
if(url){
  // Deploy com banco externo (ex.: Neon). O pacote "pg" só é exigido neste modo.
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:false},max:5});
  let ready=null;
  const init=()=>ready??=pool.query('CREATE TABLE IF NOT EXISTS app_state (chave TEXT, valor JSONB)');
  impl={
    mode:'db',
    async get(key){await init();const r=await pool.query('SELECT valor FROM app_state WHERE chave=$1',[key]);if(!r.rows.length)return null;const v=r.rows[0].valor;return typeof v==='string'?JSON.parse(v):v},
    async set(key,value){await init();const payload=JSON.stringify(value);const u=await pool.query('UPDATE app_state SET valor=$2 WHERE chave=$1',[key,payload]);if(!u.rowCount)await pool.query('INSERT INTO app_state (chave,valor) VALUES ($1,$2)',[key,payload])},
    async close(){await pool.end().catch(()=>{})}
  };
}else{
  const dir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'dados');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  try{fs.chmodSync(dir,0o700)}catch{}
  const file=key=>path.join(dir,key+'.json');
  impl={
    mode:'file',
    async get(key){try{return JSON.parse(fs.readFileSync(file(key),'utf8'))}catch{return null}},
    async set(key,value){const f=file(key);const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,key==='conteudo'?2:0),{mode:0o600});fs.renameSync(tmp,f)},
    async close(){}
  };
}
module.exports=impl;
