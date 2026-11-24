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
Clientes e serviços ainda são armazenados no IndexedDB do navegador/dispositivo; a sincronização em nuvem ainda não está ativada. O esquema inicial do Supabase já está preparado, mas não conecte nem importe dados antes de concluir a configuração de autenticação e sincronização. Limpar os dados do navegador pode apagar os registros locais. Exporte um backup antes de trocar de aparelho.

## Preparação para sincronização Supabase
O CafeFlow foi definido para usar uma conta compartilhada pelo estabelecimento nos seus aparelhos. O arquivo `supabase/schema.sql` cria tabelas para clientes, serviços e cotações, com políticas de Row Level Security que restringem cada conta aos próprios dados.

1. Crie um projeto no Supabase e abra o **SQL Editor**.
2. Execute o conteúdo de `supabase/schema.sql`.
3. Configure um arquivo `js/supabase-config.js` a partir de `js/supabase-config.example.js`, usando a URL do projeto e a chave **publishable** (ou anon) do projeto.
4. Nunca use nem publique a chave `service_role`. O arquivo local de configuração é ignorado pelo Git.
5. A autenticação, sincronização offline e migração de backup JSON ainda precisam ser implementadas antes de usar os dados na nuvem.

O arquivo de backup JSON continuará sendo o caminho de migração escolhido para os registros locais. A importação deverá ser feita após o login, com prévia e confirmação; nenhum registro local é enviado automaticamente.

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
