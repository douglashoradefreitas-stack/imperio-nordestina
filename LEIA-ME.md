# Império Nordestina — site com painel administrativo

Este pacote substitui o HTML avulso por uma aplicação com servidor e armazenamento persistente. Não é um painel fictício de navegador: o servidor verifica a senha e exige uma sessão para salvar. Não existe senha padrão.

## O que é possível editar

- Tema do ano: nome, apresentação e imagem.
- Camiseta: imagem, valor, tamanhos e instruções.
- Chave Pix e contatos públicos.
- Noivos, Rainha e Rainha G: nome, descrição e foto.
- Eventos: adicionar, editar e remover.
- Patrocinadores: adicionar, editar e remover, com logos.

O cadastro de dançantes e os pedidos de camisetas continuam sendo encaminhados ao WhatsApp. Este painel não lista inscrições, não processa pagamentos nem verifica comprovantes.

## Instalação

Requer apenas Node.js 22 ou superior. Não precisa instalar pacotes adicionais nem Python.

1. Extraia o ZIP em uma pasta do servidor.
2. Abra um terminal nessa pasta.
3. Execute `node configurar.cjs` e informe seu e-mail e uma senha de 12 caracteres ou mais. A senha não aparece ao digitar e não é gravada em texto aberto. *(Alternativa em Python: `python3 configurar.py`.)*
4. Execute `node server.cjs`.
5. No próprio computador, abra `http://localhost:3000` para o site e `http://localhost:3000/admin` para o painel.
6. Entre com o e-mail e a senha criados. Edite uma seção e clique em **Salvar alterações**. Recarregue a página pública para conferir.

## Publicação com domínio próprio

É necessário hospedar como aplicação Node.js, não como site de HTML estático. Use uma hospedagem com HTTPS, processo Node permanente e armazenamento em disco persistente. Um responsável técnico deve configurar domínio, certificado, proxy e reinício automático do processo.

Variáveis de ambiente:

- `PORT`: porta da aplicação (padrão: 3000).
- `DATA_DIR`: diretório persistente para dados e acesso. Use o mesmo valor ao executar o configurador e o servidor. Sem banco externo.
- `DATABASE_URL`: connection string de um banco Postgres externo (ex.: Neon). Quando informada, o conteúdo e o acesso ficam no banco, em vez da pasta local. O pacote `pg` é instalado automaticamente.
- `COOKIE_SECURE=true`: obrigatório na publicação com HTTPS. Não use esse valor no teste local em HTTP.

O proxy deve preservar o cabeçalho Host. As verificações de origem dependem dele. A limitação de tentativas usa o endereço de conexão direta; atrás de proxy, tentativas podem compartilhar o mesmo limite. Sessões duram até 8 horas e são invalidadas ao reiniciar a aplicação. A senha só é redefinida pelo configurador do servidor; não há recuperação por e-mail nem serviço de envio de mensagens.

## Publicação gratuita no Render, com banco Neon

O plano gratuito do Render apaga os arquivos locais a cada reinício e o site entra em espera após 15 minutos sem visitas (a primeira visita demora cerca de 1 minuto). Para as edições do painel ficarem permanentes de graça, grave o conteúdo em um banco externo gratuito.

1. Crie um projeto gratuito em https://neon.com e copie a connection string do banco (começa com `postgresql://`). Trate essa string como senha: não publique nem compartilhe.
2. Crie uma conta em https://github.com e um repositório novo (ex.: `imperio-nordestina`). Na página do repositório, use **Add file → Upload files** e arraste o conteúdo da pasta `imperio-admin`: `server.cjs`, `store.cjs`, `configurar.cjs`, `package.json`, `render.yaml`, `conteudo-inicial.json` e a pasta `public`. **Não envie** a pasta `dados` nem nenhum arquivo de acesso.
3. Em https://render.com, crie um **Web Service** apontando para esse repositório: Runtime **Node**, Build `npm install`, Start `npm start`, plano Free.
4. Nas variáveis de ambiente do Render, informe `DATABASE_URL` (a string do Neon) e `COOKIE_SECURE=true`.
5. Crie o seu acesso no banco: em um terminal do seu computador, na pasta do sistema, rode `DATABASE_URL="postgresql://..." node configurar.cjs` (no Windows: `set DATABASE_URL=postgresql://...` e depois `node configurar.cjs`). O acesso vale no Render porque fica no mesmo banco.
6. O endereço do serviço aparece no Render: site em `https://SEU-APP.onrender.com` e painel em `/admin`. Salve e teste: edite algo no painel, reinicie o serviço no painel do Render e confirme que a edição permanece.

Sem `DATABASE_URL`, o Render gratuito perde as edições a cada reinício — nesse caso, o sistema serve apenas como vitrine estática com os dados iniciais.

## Backup e senha esquecida

- Faça cópia privada da pasta de dados (`dados/`, por padrão), inclusive imagens e arquivo de acesso. Nunca publique essa pasta nem a coloque em uma hospedagem estática.
- Para redefinir a senha, execute `node configurar.cjs`, confirme a redefinição e reinicie o servidor. Isso encerra todas as sessões.
- Não compartilhe a senha pelo WhatsApp ou no código-fonte. Use uma senha exclusiva.
- O arquivo `conteudo-inicial.json` só é usado no primeiro início. Depois disso, as alterações ficam em `dados/conteudo.json`.

## Limites e observações

- Um único acesso administrativo. Sem múltiplos perfis, MFA, histórico de versões ou auditoria.
- Até 30 eventos e 30 patrocinadores; três destaques.
- Imagens PNG, JPG ou WebP, otimizadas pelo painel. A requisição inteira tem limite de 16 MB. Evite cadastrar dezenas de imagens grandes no mesmo conteúdo.
- Edições simultâneas por administradores não têm mesclagem automática: a última gravação substitui o conteúdo.
- Alterar o e-mail público não altera o login.
- Os dados iniciais foram fornecidos pelo usuário: WhatsApp +55 63 99126-6852, Instagram imperio.nordestina, e-mail imperionordestina@gmail.com, Pix 45493093000171, camiseta R$ 50,00.

O arquivo HTML entregue anteriormente permanece independente e não recebe as edições deste painel. Para que os visitantes vejam as edições, publique a versão com servidor incluída neste pacote.
