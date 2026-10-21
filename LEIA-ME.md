# Império Nordestina — site com painel administrativo

Este pacote substitui o HTML avulso por uma aplicação com servidor e armazenamento persistente. Não é um painel fictício de navegador: o servidor verifica a senha e exige uma sessão para salvar. Não existe senha padrão.

## O que é possível editar

- Tema do ano: nome, apresentação e imagem.
- Camiseta: imagem, valor, tamanhos e instruções.
- Chave Pix e contatos públicos.
- Noivos, Rainha e Rainha G: nome, descrição e foto.
- Eventos: adicionar, editar e remover.
- Patrocinadores: adicionar, editar e remover, com logos.
- Diretoria 2027: cinco grupos separados para diretoria, diretores artísticos, coreógrafos, repertório musical e ateliê.
- Dançarinos: consulta e correção dos cadastros, situação da inscrição e redefinição de senha.
- Encontros e presenças: ensaios/apresentações, participantes, chamada e justificativas.
- Pedidos: consulta e atualização da situação de retirada, preparação e entrega.

Nesta atualização, inscrições de dançarinos e pedidos são gravados no armazenamento configurado e consultados por administrador autenticado. Cada dançarino tem acesso privado ao próprio perfil. Sem configuração de pagamento, o sistema não processa pagamentos nem verifica comprovantes. O módulo opcional de Checkout Pro do Mercado Pago, descrito abaixo, só permite iniciar checkout após configuração privada no servidor; pagamentos manuais continuam explicitamente separados. A conversa pelo WhatsApp é opcional após o pedido salvo.

## Atualizar o site já publicado

1. Faça backup privado do banco atual antes da atualização. Não exclua seu projeto Neon nem altere `DATABASE_URL` ou a conta administrativa para aplicar este pacote.
2. Extraia o ZIP e substitua no mesmo repositório GitHub os arquivos `server.cjs`, `members.cjs`, `mercado-pago.cjs` e os arquivos da pasta `public`, preservando os caminhos. Envie o restante do pacote como atualização, sem a pasta `dados`, sem `.env` e sem senhas.
3. Mantenha `public/index.html`, `public/admin.html`, `public/perfil.html` e `public/diretoria.html` dentro de `public/`. Não envie o ZIP fechado para o repositório.
4. Publique a nova versão no serviço existente. As chaves antigas de conteúdo e acesso são mantidas; os novos registros usam chaves separadas. Não precisa criar o login administrativo de novo.
5. No site publicado, confira a frase inicial, `/diretoria`, `/perfil?cadastro=1` e `/admin`. Faça um cadastro de teste sem documentos reais de terceiros. Confirme a presença de ensaio e pedido no painel antes de divulgar.

## Perfis, presenças e pedidos

- Foto de perfil obrigatória no cadastro. Não é exigida foto para justificar uma falta. Não solicite cópias de documentos nem laudos no campo de justificativa.
- CPF e RG são privados. Quando CPF e RG têm o mesmo número, marque essa opção e não repita o RG.
- Para idade inferior a 18 anos, o formulário solicita identificação e contato do responsável, vínculo e declaração de autorização. A declaração não verifica a identidade nem substitui a conferência pela organização.
- O administrador corrige cadastro e redefine senha sem consultar a senha anterior. O dançarino não acessa perfis de outros participantes.
- O administrador cria ensaios e apresentações, escolhe os participantes e registra presença, falta ou pendência. O dançarino pode justificar as próprias faltas em texto, sem modificar a presença.
- **Aproveitamento dos ensaios:** presenças divididas por presenças + faltas, multiplicadas por 100, em encontros encerrados. Pendências não entram. Não representa avaliação da qualidade da dança. Sem registros concluídos, mostrar “Sem registros”.
- **Apresentações participadas:** contagem de presenças em apresentações encerradas. Não inclui agenda futura nem registros pendentes.
- Autorização do responsável e pagamentos registrados manualmente são conferidos pela organização. A confirmação automática do Mercado Pago existe apenas no módulo opcional configurado, por consulta autenticada após webhook assinado; não verifica comprovantes enviados pelo usuário.

## Controle financeiro e materiais 2027 (contrato desta atualização)

Esta implementação oferece **controle administrativo** e uma integração opcional de **Checkout Pro do Mercado Pago**, inativa enquanto o servidor não estiver configurado. Os testes desta atualização não usam contas reais e não comprovam homologação produtiva. O administrador abre **Dançarinos → Consultar e corrigir perfil → Plano financeiro**. A lista global fica na aba **Materiais 2027**. O dançarino autenticado consulta os próprios valores e a lista global na área do perfil, sem permissão de alteração. Nenhum material real é incluído inicialmente.

### APIs e armazenamento

- `GET /api/admin/dancarinos/:id/financeiro`: consulta administrativa do plano de um cadastro existente.
- `PUT /api/admin/dancarinos/:id/financeiro`: salva o plano completo normalizado. Exige sessão administrativa, `X-CSRF-Token` válido e origem compatível quando enviada.
- `GET /api/dancarinos/financeiro`: somente o plano da conta autenticada. Não aceita seleção de outra conta; parâmetros de consulta não mudam o titular. Outros métodos retornam 405 para contas autenticadas.
- `GET /api/admin/materiais-2027` e `PUT /api/admin/materiais-2027`: consulta/salvamento administrativo da lista global, com as mesmas proteções de sessão e CSRF nas mutações.
- `GET /api/dancarinos/materiais-2027`: consulta da lista por dançarino autenticado. Outros métodos não são permitidos.
- Novas chaves: `members_financeiro_v1` (`{plans: [...]}`) e `members_materiais_2027_v1`. Não há migração destrutiva nem alteração das chaves existentes. Usa a mesma camada de armazenamento e a mesma fila serial de leituras/mutações de `members.cjs`, no processo único. Contas inativas não podem consultar.
- Ambos os salvamentos enviam `version` retornada pelo GET; versão desatualizada retorna 409. Atualize/recarregue o recurso antes de reaplicar a edição. Isso evita sobrescritas silenciosas entre rascunhos. Não há coordenação entre múltiplos processos da aplicação.

### Controle de inscrições — tabela exclusiva do administrador

A aba **Controle de inscrições** é uma tabela interna, não uma planilha baixável, com exatamente **Nome, Telefone, Valor total, Parcelas pagas, Saldo**. Uma linha por cadastro atual (incluindo inativos); nome e telefone vêm diretamente de `members_cadastros_v1`. Os valores vêm somente do plano do mesmo identificador em `members_financeiro_v1`; planos órfãos de cadastros excluídos não entram. Não há dados de exemplo na interface ou cobranças presumidas pelo padrão de R$ 385,00.

- **Valor total:** soma em centavos dos valores base das parcelas efetivamente atribuídas com status diferente de Cancelado, sem taxas simuladas.
- **Parcelas pagas:** quantidade de parcelas com status Pago / quantidade de parcelas não canceladas, por exemplo `2/4`. Não é o número de prestações bancárias do cartão nem uma prova de emissão de boletos.
- **Saldo:** soma dos valores base de parcelas Pendentes. Não é total menos valor recebido: eventuais taxas ou valores manuais de recebimento diferentes não alteram esta definição.
- Sem plano ou plano sem parcelas: **Não definido** nas três colunas financeiras, com valores nulos na API; não presume dívida nem aplica a contribuição padrão. Plano com todas as parcelas canceladas: total/saldo zero e contagem `0/0`.
- **Total geral:** soma das linhas financeiramente definidas; informa também a quantidade de cadastros sem definição. O filtro local por nome não muda o total geral (indicado junto à tabela). Ao entrar ou atualizar a seção, busca novamente os dados salvos no servidor. A tabela só consulta; correções e lançamentos continuam no formulário individual existente, sem duplicação dos controles de edição.

API `GET /api/admin/controle-inscricoes`, sob a fila serial existente, retorna `{items, totals}` com nome/telefone, identificador, indicação de definição e métricas mínimas. Sessão administrativa obrigatória no servidor: anônimo recebe 401; sessão de dançarino sem sessão administrativa recebe 403. O perfil individual não consulta essa rota. Não retorna documentos, fotos, responsáveis, e-mails, credenciais, links ou dados de pagamento detalhados. Outros métodos não são permitidos; não há gravação, exportação XLSX, arquivo adicional ou ação de cobrança. Dados são inseridos no DOM por `textContent`, nunca HTML fornecido pelo cadastro. Testes externos ao pacote cobrem autorização, duas parcelas pagas de R$ 96,25 e saldo R$ 192,50, exclusão de canceladas, indefinição sem plano e preservação do armazenamento.

### Resumo visual administrativo de inscrições e recebimentos

Acima da tabela, a mesma aba e resposta `GET /api/admin/controle-inscricoes` alimentam três indicadores: **Total de inscritos**, **Valores recebidos** e **Saldo a receber**, com barra proporcional acessível de recebidos × receber. Usa os estilos azul/dourado existentes, sem bibliotecas, imagens, amostras ou arquivos adicionais. Zero cadastros/planos significa zero real; com denominador zero a barra fica neutra e indica proporção não aplicável. No celular os cartões se empilham; legendas textuais e padrão de traços distinguem as partes sem depender só de cor.

- Inscritos = cadastros de dançarinos existentes, inclusive inativos, sem pedidos de camiseta ou tentativas de inscrição; exclui cadastros deletados.
- Recebidos = soma de `payment.amountCents` das parcelas com status Pago e não canceladas de planos desses cadastros, incluindo registro manual explícito e confirmação autenticada do Mercado Pago. Não infere recebimento de clique, retorno, link geral ou parcelamento externo do cartão. A API acrescenta `receivedCents`, `manualReceivedCents` e `providerReceivedCents` nas linhas e totais, permitindo conferir as somas.
- Saldo = soma das bases pendentes, exatamente como na tabela. **Cadastros sem plano financeiro não entram no saldo a receber.** Canceladas e planos órfãos não entram em nenhum valor.
- Valores recebidos são finais registrados: não se adiciona novamente taxa simulada nem se substitui pelo valor base. Se o recebimento final divergir da base (por exemplo, acréscimo registrado), a interface explica que recebidos + saldo não equivale necessariamente ao total base da tabela. A barra divide recebidos por (recebidos + saldo); não é percentual de quitação da base. Reembolsos/contestações continuam sujeitos à conciliação descrita abaixo, sem estorno automático fictício.
- O resumo é global, independente do filtro por nome, e não é incluído no perfil individual ou em resposta pública. Mantém autorização administrativa do endpoint: anônimo 401, dançarino 403. Entrar na aba, botão Atualizar controle ou voltar o foco à janela refaz a mesma consulta; enquanto a aba está visível, sem operação/rascunho pendente, também atualiza a cada 60 segundos. Não é atualização instantânea via conexão permanente; alterações em outro processo/janela podem levar até esse intervalo. O resumo e a tabela são atualizados juntos pela mesma resposta, sem consulta duplicada de agregados.

### Contrato do plano financeiro

O PUT recebe somente `title`, `method`, `cardFeePercent` (opcional, ausência equivale a `null`), `version` e `installments`. `title` é obrigatório, até 150 caracteres; `method` aceita exatamente `Cartão de crédito` ou `Boleto`. É uma **preferência registrada pelo administrador**, não uma autorização, transação ou emissão de boleto. O dançarino apenas lê.

Cada parcela contém `id` UUID único no plano, `baseCents` inteiro seguro entre 1 e 100.000.000 centavos, `dueDate` legítima no formato `AAAA-MM-DD` a partir de 1900 e `status` exatamente `Pendente`, `Pago` ou `Cancelado`. Até 120 parcelas por plano. Campos desconhecidos, tipos incorretos, valores não finitos, centavos fracionários e datas impossíveis são rejeitados. Sem parcelas, o plano permanece vazio; o GET inicial não grava nada.

- `cardFeePercent`: `null` ou número de 0 a 100, com até duas casas decimais. Não há taxa positiva padrão nem tabela bancária presumida. Sem taxa informada para cartão: **Taxa a confirmar**. Zero é um valor explícito válido. Boleto não recebe acréscimo na simulação.
- A simulação deriva de cada **valor base**, nunca de um total já acrescido: taxa em centavos = arredondamento da base × percentual ÷ 100, uma única vez por parcela pendente. O cálculo em centavos utiliza inteiros e arredondamento de meio centavo para cima. Não há juros compostos, multa automática ou regra legal de repasse. Não se presume que essa taxa será cobrada por um futuro provedor.
- O GET retorna `estimate` por parcela pendente e `summary` com `pendingBaseCents`, `estimatedPendingCents` (nulo quando a taxa está a confirmar) e `paidCents` (soma dos valores recebidos manualmente ou confirmados por consulta ao Mercado Pago). Parcelas pagas e canceladas ficam fora da simulação pendente e não recebem nova taxa.
- Para mudar para `Pago`, o administrador deve enviar `confirmManualPayment: true`, `manualPaidCents` inteiro entre 1 e 200.000.000 e `manualNote` obrigatória até 500 caracteres. A interface exige confirmação explícita de conferência fora do site. O backend cria `payment: {source: 'manual', amountCents, note, recordedAt}`. Não é confirmação bancária nem comprovação automática.
- Parcela já paga é um registro fechado: não pode ser removida nem ter valor base, vencimento, status ou pagamento reescritos. No próximo PUT, envie apenas os quatro campos básicos dessa parcela, sem repetir os campos de confirmação. Mudar método/taxa do plano só afeta a simulação das pendentes. Registros fechados incorretos exigem procedimento de correção a ser definido; não há estorno ou auditoria financeira completa nesta versão.
- O GET também retorna `dancerId`, `version` e `updatedAt`. Identificadores e campos derivados são criados/validados pelo servidor. Ao excluir um cadastro pela API existente, o plano financeiro separado não é apagado automaticamente, mas fica inacessível pelas rotas (que exigem cadastro existente). Defina retenção e exclusão financeira antes do uso real.

### Contrato dos materiais

O PUT recebe `{version, items: [{name, quantity, unit, notes}]}`. Até 200 itens; `name` obrigatório até 150 caracteres, `quantity` inteiro entre 1 e 100.000, `unit` obrigatória até 40 caracteres, `notes` texto até 1.000 caracteres (pode ser vazio). Para quantidades fracionárias, escolha uma unidade menor e registre quantidade inteira. A resposta inclui `year: 2027`, `version` e `updatedAt`. A lista inicial é `items: []`. Itens podem ser adicionados, alterados ou removidos somente pelo administrador. Não coloque documentos ou dados pessoais em materiais globais.

### Condição de contribuição 2027 — sem lançamento automático

Condição expressamente informada pelo usuário: **total base R$ 385,00**, possibilidade de dividir em **até 4 parcelas**, opção máxima **4 × R$ 96,25 = R$ 385,00**, sem acréscimo administrativo nesses valores base. Texto do perfil: **Valor base: R$ 385,00. Em 4 vezes: R$ 96,25 por parcela. Eventuais juros ou taxas do cartão serão mostrados no Mercado Pago antes da confirmação.** Não afirma que o link está configurado em 4 vezes nem promete ausência de juros. A disponibilidade e os valores finais do cartão devem ser conferidos no checkout.

A condição é independente do valor informativo do link geral e dos planos individuais. Parcelar no cartão o pagamento total é diferente de emitir quatro cobranças. **Boleto em parcelas depende de boletos individuais efetivamente emitidos e de links próprios**, sem promessa de parcelamento de boleto pelo link geral. O botão geral passa a **Pagar total ou parcelar no Mercado Pago**; nunca é inserido como botão de pagamento da parcela de R$ 96,25. O botão de parcela permanece restrito a link explícito cadastrado pela organização.

- Na aba Dançarinos, o cartão **Contribuição 2027 · valores base** permite editar total em centavos, máximo de parcelas (inteiro de 1 a 4) e valores base da opção máxima. Alterar a quantidade sugere divisão exata em centavos, distribuindo eventual resto sem criar taxas; cada valor continua editável e a soma precisa coincidir com o total. A interface não apresenta divisão fracionária arredondada como valor exato de todas as parcelas.
- API administrativa `GET/PUT /api/admin/contribuicao-2027`, sessão obrigatória, CSRF/origem no PUT, corpo estrito `{version, totalCents, maxInstallments, installmentBaseCents}`. Total/valores inteiros de 1 a 100.000.000 centavos; lista com a quantidade exata do máximo e soma igual ao total; versão antiga retorna 409. Nova chave `members_contribuicao_2027_v1` inicia `{year:2027,totalCents:38500,maxInstallments:4,installmentBaseCents:[9625,9625,9625,9625],version:0,updatedAt:null}` no primeiro acesso autenticado. Configuração já salva não é sobrescrita. GET financeiro inclui `contribution2027`, sem alterar parcelas, pagamentos, taxas ou versão do plano.
- Em plano **novo e vazio**, o administrador pode usar **Preparar rascunho da contribuição 2027**, confirmar a preparação, preencher os vencimentos (inicialmente vazios) e revisar valores. O modelo sugere quatro bases de 9625 centavos na configuração inicial, sem link de parcela, sem pagamento registrado e sem taxa positiva predefinida. O salvamento de plano novo requer confirmação adicional. Só esse salvamento explícito grava o plano individual. Não há criação em lote nem alteração de planos existentes; cancelar a confirmação não cria parcelas. O contrato anterior de edição de planos específicos continua disponível para acordos administrativos, sem aplicar automaticamente o limite global aos registros já existentes.
- Não há seleção pelo dançarino que gere dívida, emita boleto ou configure cartão. A contribuição não é enviada ao provedor por ser exibida/editada; Checkout Pro opcional continua separado e usa somente o valor base da parcela efetivamente cadastrada no servidor.

### Links manuais do Mercado Pago — geral e por parcela

O link fornecido pelo usuário, `https://mpago.la/32gDjGQ`, é o padrão **geral**, não um link automaticamente atribuído a uma parcela ou dançarino. O usuário informou posteriormente o valor de **R$ 385,00 (38500 centavos)** para esse link geral. A interface o apresenta como **Valor informado: R$ 385,00**, não como valor validado pelo provedor. A consulta ao endereço não revelou informações verificáveis sobre valor, beneficiário, meios ou taxas; o sistema não afirma validação desses dados. Nenhuma cobrança foi executada para verificar o link.

- No perfil autenticado, o botão geral chama-se **Pagar total ou parcelar no Mercado Pago**, acompanhado do aviso exato: **Confira o valor e identifique sua parcela antes de pagar. A confirmação deste link é manual.** Aparece mesmo sem plano financeiro cadastrado, desde que exista link geral.
- Na aba **Dançarinos**, o administrador edita ou remove o link geral no cartão **Link geral de pagamento · confirmação manual**. Campo vazio e salvamento removem o botão; o padrão não reaparece após reinício. Links específicos continuam existindo.
- Cada parcela pode receber `manualPaymentUrl`, campo opcional de URL no formulário do plano. Só cadastre quando a organização tiver identificado o link correspondente. Nenhum link específico é inventado ou preenchido automaticamente.
- Para parcela pendente, somente um link específico explicitamente cadastrado gera o botão **Abrir pagamento desta parcela**. O link geral permanece independente, na seção **Pagamento por link**, evitando apresentá-lo como pagamento identificado da parcela. Sem específico, o perfil explica essa separação; quando o valor informado do link geral difere da base da parcela, mostra **Este link geral tem valor informado de R$ 385,00. Confira se corresponde à sua cobrança antes de pagar.** (valor acompanha a configuração). Parcelas pagas/canceladas não exibem ação manual por parcela. O metadado `manualLink` da API mantém o fallback geral para compatibilidade, mas a interface não oferece esse fallback como ação de parcela.
- O administrador pode editar/remover o valor informativo em centavos. Isso nunca cria dívida, parcelas, divisão ou vencimentos e não muda valores de planos individuais. A configuração nova inicia em 38500 para o link fornecido. Configuração antiga do mesmo link sem o campo recebe esse dado uma única vez; valores já existentes, remoções explícitas e outros links são preservados. Trocar a URL sem informar valor limpa a informação anterior; remover a URL também limpa o valor.
- Somente administrador altera links. URLs exigem HTTPS, até 2.000 caracteres, sem usuário/senha, portas não padrão, espaços, controles ou barras invertidas; hosts exatos permitidos: `mpago.la`, `mercadopago.com.br`, `www.mercadopago.com.br`, `mercadopago.com`, `www.mercadopago.com`. Isso valida o formato/domínio inicial, não autentica beneficiário ou valor nem inspeciona o destino de encurtadores. O usuário confere os dados antes de pagar.
- As âncoras abrem em outra aba com `rel="noopener noreferrer"`. Não acrescentam CPF, e-mail, ID ou montante à URL. Clicar ou retornar não grava pagamento, não chama o Checkout/API e não cria `mpAttempts`. Não existe baixa automática de link manual; o administrador confere o recebimento e registra o pagamento manual explicitamente.
- O Checkout Pro opcional permanece separado em área identificada no perfil. Os botões manuais não dependem de token e não ativam o gateway. Se houver checkout automático pendente da mesma conta, as proteções anteriores continuam bloqueando a alteração do plano; não use o link geral para duplicar esse pagamento.

**Contrato adicional:** `GET /api/admin/pagamentos/links` e `PUT /api/admin/pagamentos/links`, com sessão administrativa e CSRF/origem no PUT. Corpo estrito `{generalUrl, reportedAmountCents?, version}`; `reportedAmountCents` aceita `null` (sem informação) ou inteiro de 1 a 100.000.000 centavos, nunca texto/fracionário/infinito; `generalUrl: ''` remove o link. Versão antiga retorna 409. Nova chave isolada `members_links_pagamento_v1`, com `{generalUrl, reportedAmountCents, reportedAmountSource, version, updatedAt}`; o padrão é persistido apenas no primeiro acesso autenticado quando a chave não existe, dentro da fila serial existente. Configuração já existente, inclusive remoção intencional, nunca é substituída pelo padrão.

As respostas financeiras incluem `manualPayment: {generalUrl, reportedAmountCents, reportedAmountSource, providerVerified: false, notice, confirmation: 'manual'}` e, em cada parcela, `manualLink: {url, kind, label, confirmation: 'manual'}`. O campo opcional `manualPaymentUrl` só é persistido quando explícito; sua omissão no PUT preserva um link anterior e string vazia o remove. O restante do contrato financeiro, bloqueios e valores permanece igual. O teste isolado `/home/user/workspace/testar-links-pagamento.py` cobre validação, CSRF, precedência, remoção, persistência e ausência de baixa/integração automática, sem alterar os testes anteriores.

### Checkout Pro opcional do Mercado Pago — preparado, não ativado nesta entrega

**Não foram lidos segredos existentes, configurada conta real ou criadas preferências reais.** Sem configuração completa, `billing.enabled` é `false`, `provider` é `null` e o texto é **Integração de pagamento pendente de configuração**. O controle administrativo e a lista de materiais continuam funcionando. Os botões do Checkout automático só aparecem ao dançarino quando a configuração do servidor estiver completa (os links manuais da seção anterior são independentes); isso indica configuração, não certificação ou homologação do provedor.

#### Configuração pelo responsável pela hospedagem

Configure somente nas variáveis privadas do servidor, sem colar valores neste arquivo ou no navegador:

- `MP_ACCESS_TOKEN`: token da aplicação/conta recebedora. Não é armazenado no banco, HTML ou registros de diagnóstico.
- `APP_BASE_URL`: origem pública HTTPS, sem caminho, parâmetros, fragmento ou usuário/senha. IPs literais, localhost e domínios locais são recusados. Exemplo meramente ilustrativo: `https://seu-dominio.example`. Use o domínio real da hospedagem. O domínio deve resolver publicamente e o proxy preservar Host; isso exige conferência operacional.
- `MP_WEBHOOK_SECRET`: chave de assinatura do webhook da mesma aplicação Mercado Pago. Não confundir com o token.
- Mantenha `COOKIE_SECURE=true` e HTTPS no ambiente publicado. Reinicie o processo após configurar. Este código não acessa o provedor na inicialização nem em consultas de status.

No painel do Mercado Pago, configure o evento **Pagamentos**, com receptor `APP_BASE_URL` seguido de `/api/pagamentos/mercadopago/webhook`. A preferência usa essa mesma rota com `?source_news=ipn`, conforme orientação oficial para Webhooks. Valide com contas/credenciais de teste, inclusive boleto pendente e notificações reais de teste, antes de permitir uso produtivo. Não habilite pagamentos com dois meios combinados: esta versão exige um único pagamento com o valor exato da parcela, sem conciliação de pagamentos parciais. Não promete cartão ou boleto indisponíveis para a conta.

#### APIs novas e arquitetura

- `GET /api/admin/pagamentos/status`: sessão administrativa obrigatória; informa somente disponibilidade, provedor e política de valores. Nunca retorna token, assinatura ou partes deles. É diagnóstico local de configuração, sem chamada ao Mercado Pago.
- `POST /api/dancarinos/checkout`: sessão própria ativa e CSRF/origem como nas outras mutações. Corpo estrito `{installmentId, requestId}`, ambos UUID. Não aceita valor, proprietário, taxa ou URL vindos do cliente. A parcela deve pertencer ao dançarino e estar `Pendente`; paga/cancelada é recusada.
- `POST /api/pagamentos/mercadopago/webhook?data.id=ID&type=payment`: endpoint público sem sessão/CSRF, protegido por HMAC. Sem secret/configuração retorna 503 e não consulta nem processa pagamento. Assinatura inválida retorna 401. Não há rota de retorno que marque pagamento como confirmado: `/perfil?pagamento=retorno` apenas informa e consulta o estado salvo.
- `GET` dos planos mantém o contrato anterior e acrescenta `billing` e `checkoutAttempts` filtrados por titular. Tentativas mostradas no painel/perfil não incluem referência externa, URL de checkout ou segredos.
- Módulo `mercado-pago.cjs`, chamado dentro da mesma fila serial de `members.cjs`; sem nova dependência. Persistência de plano e `mpAttempts` na mesma chave `members_financeiro_v1` permite baixa e idempotência em uma gravação. Chaves antigas não são substituídas. Requer **um único processo/instância gravadora**, como a fila existente; não é solução distribuída.

#### Valores, privacidade e tentativa idempotente

A preferência é criada no servidor por `POST https://api.mercadopago.com/checkout/preferences`, com Bearer no cabeçalho. Envia um item genérico da temporada, quantidade 1, moeda BRL e **somente `baseCents / 100`**. Não adiciona a taxa manual da simulação, `marketplace_fee`, juros ou qualquer preço inventado. O custo final e o parcelamento do cartão são apresentados no ambiente hospedado: **Taxa a confirmar no checkout final**. Parcelas do plano e parcelamento bancário são conceitos distintos; cada checkout trata uma parcela do plano. O percentual administrativo não é uma taxa contratual do Mercado Pago.

Nenhum campo `payer` é enviado: nome, e-mail, CPF, RG, foto e responsável do cadastro ficam no sistema. Dados eventualmente exigidos pelo provedor são preenchidos pelo próprio pagador no checkout hospedado. Não há coleta de cartão no site. `external_reference` é uma sequência aleatória opaca de 32 bytes, associada internamente ao titular, parcela, valor e versão do plano; não contém documento nem identificador pessoal.

Antes do POST remoto, persiste uma tentativa `creating`. Uma tentativa bem-sucedida passa para `ready` e guarda apenas os identificadores necessários, recebedor e URL validada do checkout. Nova solicitação para a mesma parcela reutiliza a preferência, mesmo com outro `requestId` ou após reinício. Reutilizar `requestId` em outra parcela é recusado. **Não se presume garantia de `X-Idempotency-Key` na API de preferências:** após erro, timeout ou queda entre criação e persistência, a tentativa fica `uncertain` (ou `creating` após queda) e não repete o POST automaticamente. Isso evita criar outra preferência para um resultado desconhecido, mas exige conciliação operacional; não há endpoint de desbloqueio ou reconciliação automática nesta versão. URLs retornadas são aceitas somente por HTTPS e domínios exatos autorizados do checkout Mercado Pago, sem credenciais/portas extras.

Enquanto houver tentativa não aprovada, o plano inteiro fica bloqueado para edição, pagamento manual e exclusão do cadastro, independentemente de a configuração estar ativa ou não. Não é suficiente trocar valor/status local: esta versão **não cancela boletos/pagamentos no provedor**, não invalida associações silenciosamente e não libera a edição automaticamente por expiração ou rejeição. A organização deve conciliar no Mercado Pago antes de qualquer correção técnica. É uma limitação deliberada de segurança, não um cancelamento implementado.

#### Webhook e confirmação

Segue o manifesto oficial `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparado em tempo constante com `v1` de `x-signature`. Exige `data.id` numérico único na consulta, `x-request-id`, `ts` e `v1`; corpo e consulta devem identificar o mesmo pagamento e tópico. Há política local adicional de tolerância de 10 minutos, aceitando timestamp em segundos ou milissegundos; mantenha relógio do servidor sincronizado. Notificações legítimas fora dessa janela podem precisar de reenvio, sem baixa por atalho.

Somente após assinatura válida faz `GET /v1/payments/{id}` autenticado. Verifica ID, referência opaca conhecida, `currency_id: BRL`, valor decimal convertido exatamente em centavos e `collector_id` igual ao recebedor da preferência criada com o token. Consulta ainda `GET /checkout/preferences/{id}` para conferir referência, item, moeda, valor e coletor e `GET /merchant_orders/{payment.order.id}` para conferir a ordem, preferência, referência, recebedor e participação do payment ID. Se o vínculo não estiver disponível, recusa a baixa em vez de supor sucesso. Não é necessário endpoint adicional de identificação da conta; o coletor vem da preferência retornada autenticadamente e é reconferido em todas as consultas.

Baixa automática só com `status: approved`, sem valor reembolsado, parcela ainda pendente e valor igual ao registrado. Grava `payment.source: 'mercadopago'`, valor base confirmado, data, payment ID e preference ID; incrementa a versão do plano. `pending`, boleto emitido, `authorized`, `in_process`, retorno do navegador e parâmetros `status=approved` não dão baixa. Erros de rede ou divergências preservam o estado anterior, retornando erro para permitir reenvio. Assinatura inválida não inicia consulta. Eventos não relacionados ao sistema são reconhecidos sem alterar plano. Repetição de evento aprovado não duplica a baixa nem a versão.

Todas as chamadas remotas têm limite de 4 segundos, sem redirecionamento e sem repetição automática de POST. As consultas e a gravação ocorrem antes do 200 (diferentemente de confirmação antecipada com fila durável), para não reconhecer evento ainda não persistido. O limite oficial de resposta é de 22 segundos; a fila serial e latência podem ocasionar reenvios sob carga. Não há promessa de escala, monitoramento ou disponibilidade. Não registrar corpos do provedor, token ou chave em registros de proxy/APM.

#### Limites após pagamento e antes da produção

Reembolso, contestação, mediação, mudança depois de aprovado e pagamentos adicionais geram `reviewRequired` visível à organização quando percebidos por notificação de pagamento válida. O histórico `Pago` não é apagado, nenhuma devolução é executada e nenhum saldo contábil é recomposto automaticamente. Não há integração dos tópicos específicos de chargeback, reclamações ou alertas de fraude, rotina de recuperação de webhooks perdidos, conciliação de dois meios/parcial, estorno, novo checkout automático após falha ou cancelamento remoto. A organização precisa acompanhar o painel Mercado Pago e estabelecer conciliação, reembolso e atendimento antes de ativar produção. Um alerta nunca equivale a problema resolvido.

**Situação desta atualização:** implementação testada somente com respostas simuladas, preparada mas não ativada com credenciais do usuário. O pacote precisa ser aplicado ao serviço existente; não houve publicação automática. Esta versão utiliza a API de preferências; a escolha técnica não significa homologação nem garantia de disponibilidade futura. Antes de ativar o gateway, confira a documentação oficial atual e realize os testes de integração.

#### Fontes oficiais consultadas

- Visão geral e pagamento hospedado: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview
- Endpoints e recomendação atual de Orders versus Preferences: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-orders/overview.md
- Criação de preferências: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/preferences/create-preference/post
- Consulta de preferência: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/preferences/get-preference/get
- Consulta de pagamento/status/valores: https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/get-payment/get.md
- Ordem comercial e `preference_id`: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/merchant_orders/get-merchant-order/get
- Pagamentos, notificações e limite para dois meios: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- Assinatura, manifesto e HMAC: https://www.mercadopago.com.br/developers/en/docs/checkout-pro-preferences/additional-settings/optional-notifications
- Webhooks e consultas: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks
- Relação `payment.order.id` com ordem comercial e parâmetro de notificação (usa apenas esses detalhes, **não implementa IPN**): https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/additional-content/your-integrations/notifications/ipn

### Verificação local isolada

O teste externo ao pacote está em `/home/user/workspace/testar-financeiro.py`. Execute `python3 /home/user/workspace/testar-financeiro.py` no ambiente de trabalho. Usa apenas a biblioteca padrão do Python, um servidor Node temporário, uma porta livre, contas fictícias e `DATA_DIR` temporário, forçando `DATABASE_URL` vazio. Testa autenticação, CSRF/origem, isolamento entre dançarinos, validações, taxa ausente/zero/100%, registro manual, bloqueio de alterações em pagos, persistência após reinício, proteção dos arquivos privados e preservação byte a byte das chaves antigas. Não lê nem modifica contas reais. O arquivo de testes não faz parte do pacote da aplicação. O teste separado `/home/user/workspace/testar-mercado-pago.py` valida o novo fluxo por HTTP com uma API local simulada e bloqueio de chamadas externas, sem alterar o teste principal: CSRF, proprietário, valor/referência/coletor/preferência, assinatura válida/inválida, idempotência, reinício, resultado incerto e retorno sem confirmação. Usa somente credenciais fictícias em ambiente criado pelo próprio teste. Conferência visual desktop/móvel e homologação com conta de teste do provedor são etapas separadas.

## Antes de coletar documentos de participantes

Os campos implementados não tornam o sistema automaticamente adequado a todas as exigências legais. A organização deve definir finalidade, necessidade da coleta de CPF/RG, prazo de retenção, atendimento para correção/exclusão e procedimento de confirmação do responsável. Publique um aviso de privacidade adequado antes de recolher documentos reais. Não coloque CPF, fotos de perfis privados ou dados de responsáveis no conteúdo público da diretoria. A ANPD destaca proteção do melhor interesse, transparência e verificação adequada da autorização quando necessária: https://www.gov.br/participamaisbrasil/tscriancaeadolescente .

## Instalação

Requer Node.js 22 ou superior. Execute `npm install` na pasta da aplicação para instalar o conector de banco Postgres. Python não é necessário para utilizar o painel.

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
5. Crie o seu acesso no banco. No Windows, o jeito mais fácil: abra a pasta do sistema no seu computador e dê **duplo clique em `criar-acesso.bat`** — ele pergunta a connection string do Neon, seu e-mail e a senha, e grava tudo no banco. Alternativa por terminal: `DATABASE_URL="postgresql://..." node configurar.cjs`. O acesso vale no Render porque fica no mesmo banco.
6. O endereço do serviço aparece no Render: site em `https://SEU-APP.onrender.com` e painel em `/admin`. Salve e teste: edite algo no painel, reinicie o serviço no painel do Render e confirme que a edição permanece.

Sem `DATABASE_URL`, o Render gratuito perde as edições a cada reinício — nesse caso, o sistema serve apenas como vitrine estática com os dados iniciais.

## Backup e senha esquecida

- No modo local, faça cópia privada da pasta `dados/`, inclusive imagens, registros e arquivo de acesso. No modo Postgres/Neon, faça backup privado do banco configurado em `DATABASE_URL`; a pasta local não contém esses dados. Nunca publique backups ou a pasta de dados em hospedagem estática.
- Para redefinir a senha, execute `node configurar.cjs`, confirme a redefinição e reinicie o servidor. Isso encerra todas as sessões.
- Não compartilhe a senha pelo WhatsApp ou no código-fonte. Use uma senha exclusiva.
- O arquivo `conteudo-inicial.json` só é usado quando ainda não há conteúdo salvo. Depois disso, os registros ficam na pasta local de dados ou no banco definido em `DATABASE_URL`. Substituir o conteúdo inicial não substitui as edições já salvas.

## Limites e observações

- Um único acesso administrativo e contas individuais de dançarinos. Sem múltiplos administradores, autenticação de dois fatores, histórico de versões ou auditoria completa.
- Até 30 eventos e 30 patrocinadores; três destaques.
- Imagens PNG, JPG ou WebP, otimizadas pelo painel. A requisição inteira tem limite de 16 MB. Evite cadastrar dezenas de imagens grandes no mesmo conteúdo.
- Edições simultâneas por administradores não têm mesclagem automática: a última gravação substitui o conteúdo.
- Alterar o e-mail público não altera o login.
- Os dados iniciais foram fornecidos pelo usuário: WhatsApp +55 63 99126-6852, Instagram imperio.nordestina, e-mail imperionordestina@gmail.com, Pix 45493093000171, camiseta R$ 50,00.

O arquivo HTML entregue anteriormente permanece independente e não recebe as edições deste painel. Para que os visitantes vejam as edições, publique a versão com servidor incluída neste pacote.
