# CafeFlow Web — projeto inicial

Aplicação web responsiva e offline-first para controle pessoal de secagem e pilagem de café.

## Funcionalidades incluídas
- Cadastro, edição, busca e histórico de clientes.
- Criação de serviços com tamanho de saco e numeração manual; a quantidade acompanha automaticamente os números informados.
- Sem peso de entrada: o peso só é solicitado ao finalizar a pilagem.
- Dois secadores independentes.
- Edição de quantidade e numeração dos bags de um serviço.
- A entrada na fila de pilagem é manual pelo botão **Pronto para pilagem**.
- Apenas um serviço pode ficar em pilagem por vez.
- Finalização com peso bruto por bag e tara individual obrigatória; a tara é multiplicada pela quantidade de bags, descontada do bruto e exibida separadamente do peso líquido.
- Armazém de serviços finalizados encaminhados manualmente, com bags, peso real ou estimado e exclusão ao registrar retirada.
- Exclusão confirmada de serviços finalizados pela tela Serviços.
- Relatório em PDF para download por serviço, com valor manual ou pagamento em café. O PDF mostra apenas o peso final do serviço, sem detalhar tara ou descontos dos bags; no pagamento em café, discrimina a taxa de secagem (90 kg por secador atribuído) da taxa de pilagem (1,5 kg por saca de 60 kg), mostrando os valores em kg e reais, o peso líquido e a quantidade de sacas líquidas. O valor manual permanece informado pelo usuário.
- Tela de cotação diária com estimativa de venda e cotação salva localmente para o dia.
- Conversão do peso final em sacas de 60 kg nos detalhes e no relatório do serviço.
- Campos numéricos aceitam vírgula decimal; a cotação é calculada pelo botão **Calcular**.
- Dashboard com ativos, fila, concluídos e peso final total.
- Persistência local com IndexedDB.
- Backup dos clientes, serviços e cotação em arquivo JSON, com validação na importação e opção de mesclar sem sobrescrever dados ou substituir após confirmação.
- Os backups ficam sob responsabilidade do usuário; armazene a cópia baixada fora do navegador. A importação aceita arquivos JSON de até 10 MB.
- PWA com Service Worker para uso offline após a primeira abertura.
- Preparação do banco Supabase com políticas RLS por conta em `supabase/schema.sql`.

## Como executar
O Service Worker e a instalação PWA precisam de `localhost` ou HTTPS. Não abra apenas clicando duas vezes no `index.html`.

### Opção simples com Python
1. Instale Python 3, se ainda não tiver.
2. Abra o terminal dentro desta pasta.
3. Execute:
   ```bash
   python -m http.server 8000
   ```
4. Abra `http://localhost:8000` no navegador.

### Alternativa com VS Code
Instale a extensão **Live Server**, clique com o botão direito em `index.html` e escolha **Open with Live Server**.

## Dados e privacidade
Clientes e serviços continuam armazenados no IndexedDB deste navegador, e a cotação diária no armazenamento local. Com uma conta CafeFlow conectada, novas alterações são colocadas em uma fila local e sincronizadas com o Supabase quando há conexão. Ao entrar pela primeira vez, dados existentes neste aparelho não são enviados automaticamente; use a importação explícita do backup quando estiver pronto para migrá-los. Limpar os dados do navegador pode apagar registros ainda não sincronizados. Exporte backups regularmente.

## Conta e sincronização Supabase
O CafeFlow usa uma conta compartilhada pelo estabelecimento. A tela **Conta** permite criar uma conta com e-mail e senha, entrar e sair deste aparelho e sincronizar alterações. O Supabase pode exigir confirmação do e-mail antes do primeiro acesso.

1. No Supabase, execute `supabase/schema.sql` no **SQL Editor**. O esquema cria tabelas para clientes, serviços e cotações, com RLS por conta.
2. Crie `js/supabase-config.js` seguindo `js/supabase-config.example.js`, usando a URL do projeto e uma chave **publishable** (ou anon). Esse arquivo é ignorado pelo Git.
3. Configure a URL de redirecionamento de autenticação do Supabase para o endereço onde o app está aberto. Para o servidor local padrão, permita `http://localhost:8000/**`. Ao publicar em HTTPS, adicione também o domínio publicado.
4. Abra **Conta**, crie a conta do estabelecimento uma vez e entre com ela nos outros aparelhos.
5. As alterações novas são enfileiradas localmente e sincronizadas quando online. Se a mesma informação divergir entre aparelhos, a tela **Conta** solicita uma decisão; o app não escolhe silenciosamente uma versão.
6. Para migrar registros anteriores, selecione um backup válido na tela **Backup** e use **Mesclar backup e enviar à nuvem**. A ação exige confirmação, mescla os registros no aparelho sem substituir os dados locais com IDs iguais e envia somente os registros incluídos naquele arquivo. Divergências com a nuvem ficam para revisão manual. **Restaurar backup** continua sendo uma operação somente local e não envia dados automaticamente.

O SDK do Supabase é carregado sob demanda pela internet ao abrir a tela de conta; as telas e os dados locais continuam disponíveis offline. Nunca coloque uma chave `secret` ou `service_role` no navegador. A chave publishable é destinada ao cliente e depende das políticas RLS para proteger os dados.

## Publicar na Vercel
1. Importe `MarcosPaulucio/CafeFlow` na Vercel com a integração do GitHub e mantenha a raiz do projeto na pasta principal do repositório.
2. Cadastre `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` nas variáveis de ambiente de **Production** e **Preview**. Use a URL HTTPS do projeto e a chave publishable (ou anon); nunca use `secret` ou `service_role`.
3. O `vercel.json` executa `scripts/generate-supabase-config.mjs` no build. O script valida as variáveis e cria `js/supabase-config.js`, que é ignorado pelo Git, sem expor chaves privadas no repositório.
4. Após o primeiro deploy, adicione o domínio `https://<seu-projeto>.vercel.app` como **Site URL** e como URL de redirecionamento permitida no Supabase, por exemplo `https://<seu-projeto>.vercel.app/**`. Mantenha também `http://localhost:8000/**` para desenvolvimento local.

## Observações desta versão
- Esta é uma primeira versão funcional para testes, ainda não auditada para produção.
- O Service Worker guarda os arquivos do app para acesso offline. A primeira abertura deve ocorrer com conexão.
- O Google Fonts é apenas decorativo; se não houver internet, o navegador usa a fonte alternativa instalada.
- Para compartilhar dados entre computador e celular ou entre operadores, será necessário adicionar sincronização/backend.

## Estrutura de pastas
- `index.html`, `manifest.webmanifest` e `sw.js`: estrutura compartilhada, entrada e configuração da PWA.
- `views/`: um fragmento HTML independente para cada tela; `js/main.js` carrega as telas antes de iniciar a aplicação.
- `css/`: estilos da aplicação.
- `js/app.js`: estado, renderização e eventos da interface.
- `js/domain.js`: validações e regras de negócio puras, incluindo pesagem, pagamento em café e estimativa de cotação.
- `js/storage.js`: IndexedDB e operações de exportação, validação e restauração de backups.
- `assets/`: ícones e recursos estáticos.

As telas são carregadas como arquivos estáticos, sem build ou dependências adicionais. O Service Worker mantém os fragmentos e módulos necessários no cache para uso offline após a primeira abertura bem-sucedida.
