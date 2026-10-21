"""Cria ou redefine o único acesso administrativo, no terminal do servidor."""
from pathlib import Path
import getpass,hashlib,secrets,json,os,re

root=Path(os.environ.get('DATA_DIR',Path(__file__).resolve().parent/'dados'))
root.mkdir(mode=0o700,parents=True,exist_ok=True)
dest=root/'acesso.json'
if dest.exists():
    print('Este procedimento redefine o acesso. Reinicie o servidor após concluir.')
    if input('Digite REDEFINIR para continuar: ').strip()!='REDEFINIR':
        raise SystemExit('Nenhuma alteração realizada.')
email=input('E-mail para acessar o painel: ').strip().lower()
if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):
    raise SystemExit('E-mail inválido.')
password=getpass.getpass('Crie uma senha com pelo menos 12 caracteres: ')
if len(password)<12 or len(password)>256:
    raise SystemExit('A senha precisa ter entre 12 e 256 caracteres.')
if password!=getpass.getpass('Repita a senha: '):
    raise SystemExit('As senhas não coincidem.')
salt=secrets.token_bytes(16)
hashed=hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1,dklen=64)
fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as out:
    json.dump({'email':email,'salt':salt.hex(),'hash':hashed.hex()},out)
os.chmod(dest,0o600)
print('Acesso criado. Inicie ou reinicie o servidor com: node server.cjs')
