# SistemaAdmin — Documentação Técnica

**Arquivo:** `SistemaAdmin.html` (single-page application)  
**Deploy:** Netlify (arrastar zip no painel)  
**Backend:** Supabase PostgREST (REST direto + RPCs em PostgreSQL)  
**Autenticação:** RPC `admin_login` com senha bcrypt (pgcrypto)

---

## Arquitetura

```
Browser → SistemaAdmin.html
             ↓ fetch() com apikey anon
         Supabase PostgREST
             ↓
         PostgreSQL (tabelas + RPCs SECURITY DEFINER)
```

Não há servidor próprio. Toda lógica de negócio está em funções PostgreSQL chamadas via `/rest/v1/rpc/`.

### Credenciais Admin

| Campo  | Valor          |
|--------|----------------|
| Telefone | `83000000000` |
| Senha  | `admin1234`    |
| Tabela | `admin_users`  |
| RPC    | `admin_login(p_phone, p_password)` |

A sessão é salva em `localStorage` (`so_token`, `so_user`) para auto-login.

---

## Estrutura de Navegação

A sidebar lateral tem 100px de largura e lista os painéis abaixo em ordem:

| # | Menu | ID do painel | Função de carga |
|---|------|-------------|-----------------|
| 1 | Vendedores | `p-vendedores` | `loadVendedores()` |
| 2 | Saldo | `p-saldo` | `loadSaldoPage()` |
| 3 | Caixa | `p-caixa` | `initCaixa()` |
| 4 | Apostas | `p-apostas` | `initApostas()` |
| 5 | Descarrego | `p-descarrego` | `loadDescarregoPage()` |
| 6 | Lançamentos | `p-lancamentos` | `initLancamentos()` |
| 7 | Prestar Contas | `p-prestacao` | `initPrestacao()` |
| 8 | Extrações | `p-extracoes` | `loadExtracoesPage()` |
| 9 | Sorteios | `p-sorteios` | `loadSorteiosPage()` |
| 10 | Resultados | `p-resultados` | `initResultados()` |
| 11 | Venda | `p-venda` | `initVenda()` |
| 12 | Comissões | `p-comissoes` | `loadComissoes()` |
| 13 | Bilhetes | `p-bilhetes` | `initBilhetes()` |
| 14 | Auditoria | `p-auditoria` | `loadAuditoria()` |
| 15 | Config | `p-config` | `loadConfig()` |
| — | Sair | — | `doLogout()` |

---

## Painéis — Detalhamento

### 1. Vendedores (`p-vendedores`)

Lista todos os vendedores cadastrados na tabela `vendedores`.

**Funcionalidades:**
- Busca/filtro por nome, telefone ou usuário (campo de pesquisa)
- Tabela: Nome, Saldo, Status (Ativo/Inativo), Editar, Apagar
- Botão **Novo Vendedor** → abre painel `p-criar-vendedor`
- Botão **Apagar** → modal de confirmação antes de deletar

**Painel Criar/Editar Vendedor (`p-criar-vendedor`):**

| Campo | Descrição |
|-------|-----------|
| Telefone | Login do vendedor (obrigatório) |
| Nome | Nome de exibição |
| Senha | Nova senha (deixar vazio = manter atual) |
| Saldo Inicial | Valor em R$ |
| Status | Ativo / Inativo |
| Endereço | Campo livre |
| Telefone 2 | Contato alternativo |

RPC usada: `upsert_vendedor(p_id, p_phone, p_name, p_password, p_balance, p_is_active)`

---

### 2. Saldo (`p-saldo`)

Adiciona saldo manualmente a um vendedor.

**Campos:**
- Select de vendedor (carregado da lista)
- Saldo atual exibido em tempo real ao selecionar
- Campo de valor a adicionar
- Botão **Adicionar Saldo**

RPC: `add_balance(p_user_id, p_amount)`

---

### 3. Caixa (`p-caixa`)

Relatório financeiro consolidado por período e vendedor.

**Filtros:** Data início, Data fim, Vendedor (opcional)

**Cards de resumo:**
- Entrada total
- Em aberto (apostas pendentes)
- Não pago
- Pago (prêmios)
- Comissão estimada (10%)
- Cancelado
- **Total líquido** (verde = positivo, vermelho = negativo)

**Tabela por vendedor:** Apostado, Prêmios, Comissão, Qtd apostas, Líquido

Fonte de dados: tabela `apostas` via filtros de data/usuário.

---

### 4. Apostas (`p-apostas`)

Consulta e gestão de apostas individuais.

**Filtros:** Vendedor, Status, Sorteio, Data, Número da aposta

**Status possíveis:**
- `pending` → Pendente (pode cancelar)
- `won` → Ganhou
- `lost` → Perdeu
- `cancelled` → Cancelado

**Tabela:** ID, Vendedor, Modalidade, Números, Valor, Status, Data, Ação (Cancelar)

**Totalizador no rodapé:** total de apostas, pendentes, ganhadores, valor total, prêmios pagos, líquido.

Cancelamento via PATCH direto na tabela `apostas` (`status = 'cancelled'`).

---

### 5. Descarrego (`p-descarrego`)

Controle de risco de exposição por modalidade/número/prêmio.

**Sub-abas:**

#### ⚙ Limites
- Lista todos os registros da tabela `descarrego_config`
- Colunas: Modalidade, Prêmio, Limite (R$) editável inline, Ativo
- Campo de limite é editável diretamente na célula (`onchange` salva automaticamente)
- RPC: `salvar_limite(p_id, p_limite)`

#### 📊 Exposição
- Seleciona um sorteio e mostra exposição atual por modalidade/prêmio/número
- Colunas: Modalidade, Prêmio, Número, Exposição (R$), Limite (R$), Disponível (R$)
- Fonte: tabela `descarrego_config` com cálculo de apostas via RPC `get_exposicao`

#### 📋 Histórico
- Seleciona um sorteio e exibe o histórico de descarregos aplicados
- Colunas: Modalidade, Prêmio, Número, Apostado, Retido, Descarregado, Limite, Data
- Fonte: tabela `descarrego_historico`

**Como o descarrego funciona no backend:**  
A cada aposta registrada via `/bets/batch` no APK, a RPC `aplicar_descarrego` é chamada automaticamente. Ela aplica o mecanismo de controle de risco: retém o valor dentro do limite configurado e registra o excedente como descarregado para banca externa.

---

### 6. Lançamentos (`p-lancamentos`)

Registro de movimentações financeiras manuais (créditos e débitos).

**Filtros:** Vendedor, Data

**Formulário (lateral esquerda):**
- Vendedor
- Data
- Tipo: crédito / débito / prêmio / estorno
- Valor

**Tabela (direita):** Operador, Valor (verde=crédito, vermelho=débito), Tipo, Data, Excluir

**Totalizador:** Total créditos, Total débitos, Saldo líquido

Fonte: tabela `transacoes`.

---

### 7. Prestar Contas (`p-prestacao`)

Encerramento de conta entre admin e vendedor(es).

**Filtros:** Data início, Data fim, Vendedor (opcional — se vazio, processa todos)

**Tabela:** Vendedor (taxa%), Entrada, Aberto, Saídas, Comissão, Lançamentos, Total, Ação

**Botões:**
- **Buscar** → calcula para os vendedores filtrados
- **Prestar conta com todos** → processa lista inteira exibida

**Ação por vendedor:** Botão "Prestar contas" → abre confirmação com total calculado → RPC `prestar_conta(p_user_id, p_total, p_admin_id)`

O cálculo considera: apostas (entrada/prêmios/comissão) + lançamentos manuais do período.

---

### 8. Extrações (`p-extracoes`)

Gerenciamento das extrações (modalidades de loteria) e seus horários.

**Lista de extrações** (tabela `extracoes`): Nome, badge Ativa/Inativa

**Por extração:**
- Lista de horários cadastrados (chips removíveis)
- Campo `time` + botão **Adicionar Horário**
- Horários salvos na tabela `horarios_extracoes`

---

### 9. Sorteios (`p-sorteios`)

Criação e gestão de sorteios diários.

**Filtros:** Data, Status (Aberto/Encerrado)

**Tabela:** ID, Extração + Horário, Data, Status, Resultado, Ação

**Modal Novo Sorteio:**
- Select de extração (carregado de `extracoes`)
- Select de horário (carregado dinamicamente por extração)
- Data
- Cria via POST na tabela `sorteios`

**Inserir Resultado:**
- Botão aparece em sorteios com `status = 'open'`
- RPC: `salvar_resultado(p_id, p_result)` — encerra o sorteio e processa prêmios

---

### 10. Resultados (`p-resultados`)

Consulta de resultados de sorteios publicados.

**Filtros:** Modalidade, Data

**Tabela:** Nome do sorteio, Modalidade, Resultado (números), Data/Hora

---

### 11. Venda (`p-venda`)

Relatório de vendas consolidado por vendedor no período.

**Filtros:** Vendedor, Data início, Data fim

**Tabela:** Vendedor, Qtd apostas, Entrada, Prêmios, Comissão, Líquido

**Totalizador no rodapé.**

Tenta chamar `/bets/summary` primeiro; em caso de falha, processa `apostas` diretamente no cliente.

---

### 12. Comissões (`p-comissoes`)

Configuração de taxas de comissão por modalidade.

| Campo | Modalidade |
|-------|-----------|
| cm-milhar | Milhar/Centena |
| cm-grupo | Grupo/Dezena |
| cm-seninha | Seninha |
| cm-sena | Sena Brasil |
| cm-bolao | Bolão |
| cm-2p500 | 2 pra 500 |
| cm-rifa | Rifa |

Salvo via RPC `upsert_commission_settings(...)` na tabela `commission_settings`.

---

### 13. Bilhetes (`p-bilhetes`)

Validação e pagamento de bilhetes premiados.

**Fluxo:**
1. Digitar ou escanear código do bilhete (formato `SO-XXXXXX-XXXX`)
2. Sistema consulta `apostas` com join em `vendedores` e `sorteios`
3. Exibe: Código, Vendedor, Modalidade, Números, Valor apostado, Prêmio, Status, Data
4. Se `status = 'won'` → botão **Dar Baixa** confirma pagamento

RPC: `pagar_premio(p_ticket_code, p_admin_id)` — atualiza status para `paid`.

**Suporte a leitor de código de barras USB** (envia Enter automaticamente).

---

### 14. Auditoria (`p-auditoria`)

Log de ações administrativas.

**Filtros:** Data início, Data fim, Tipo de ação

**Tabela:** Admin, Ação, Detalhe (JSON), IP, Data/Hora

Fonte: tabela `audit_log`.

---

### 15. Config (`p-config`)

Configurações gerais do sistema.

| Campo | Chave | Descrição |
|-------|-------|-----------|
| Apostas ativas | `apostas_ativas` | Liga/desliga apostas no PDV |
| Milhar Brinde disponível | `milhar_brinde` | Não / Valor fixo / Múltiplo |
| Valor mínimo milhar brinde | `mb_min` | Valor mínimo para acionar brinde |
| Valor prêmio brinde | `mb_premio` | Valor do prêmio brinde |
| Tempo cancelamento | `tempo_cancelamento` | Minutos para cancelar bilhete |
| Texto do bilhete | `texto_bilhete` | Rodapé impresso no bilhete |
| Base da API | — | URL do Supabase (exibição) |

Salvo na tabela `system_config` (chave/valor).

---

## Modais

| ID | Título | Função |
|----|--------|--------|
| `modal-sorteio` | Novo Sorteio | Criar sorteio com extração + horário |
| `modal-resultado` | Inserir Resultado | Digitar resultado de sorteio aberto |
| `modal-confirm` | Confirmar | Confirmação genérica (apagar, cancelar) |

Modais fecham clicando fora (overlay) ou no botão Cancelar.

---

## Banco de Dados — Tabelas Utilizadas

| Tabela | Uso |
|--------|-----|
| `admin_users` | Autenticação do administrador |
| `vendedores` | Cadastro de vendedores |
| `apostas` | Apostas registradas pelos vendedores |
| `sorteios` | Sorteios por data/horário/extração |
| `extracoes` | Modalidades de loteria (ex: Federal, Loteria) |
| `horarios_extracoes` | Horários de cada extração |
| `transacoes` | Lançamentos financeiros manuais |
| `commission_settings` | Taxas de comissão por modalidade |
| `system_config` | Configurações gerais (chave/valor) |
| `audit_log` | Log de ações administrativas |
| `descarrego_config` | Limites de exposição por modalidade/prêmio |
| `descarrego_historico` | Histórico de descarregos aplicados |

---

## RPCs (Funções PostgreSQL)

| RPC | Descrição |
|-----|-----------|
| `admin_login(p_phone, p_password)` | Autenticação bcrypt, retorna dados do admin |
| `upsert_vendedor(...)` | Criar ou editar vendedor com hash de senha |
| `add_balance(p_user_id, p_amount)` | Adicionar saldo ao vendedor |
| `prestar_conta(p_user_id, p_total, p_admin_id)` | Encerrar conta do vendedor |
| `salvar_resultado(p_id, p_result)` | Salvar resultado de sorteio e processar prêmios |
| `upsert_commission_settings(...)` | Salvar taxas de comissão |
| `pagar_premio(p_ticket_code, p_admin_id)` | Dar baixa em bilhete premiado |
| `aplicar_descarrego(...)` | Aplicar controle de risco em aposta (chamado pelo APK) |
| `trocar_senha_vendedor(...)` | Vendedor troca sua própria senha (chamado pelo APK) |

---

## Helpers JavaScript

| Função | Descrição |
|--------|-----------|
| `_rpc(name, params)` | Chama RPC via POST `/rest/v1/rpc/` |
| `api(method, route, body)` | Roteador REST → mapeia rotas para tabelas Supabase |
| `_sbH(extra)` | Monta headers com `apikey` e `Content-Type` |
| `_sbResp(response)` | Trata resposta fetch (erro/sucesso/204) |
| `fmtBRL(value)` | Formata número como `R$ 1.234,56` |
| `fmtDt(isoString)` | Formata data ISO para `pt-BR` |
| `today()` | Retorna data atual no formato `YYYY-MM-DD` |
| `showPage(id)` | Ativa painel e destaca item do menu |
| `buildNav()` | Constrói sidebar dinamicamente após login |
| `closeModal(id)` | Fecha modal overlay |

---

## Segurança

- Credenciais do banco **nunca** expostas no HTML (usa anon key pública do Supabase)
- Todas as operações sensíveis (login, pagamento, prestar contas) são `SECURITY DEFINER` no PostgreSQL
- Senha do admin armazenada com bcrypt (`pgcrypto crypt()` com `gen_salt('bf')`)
- Token de sessão salvo em `localStorage` (não é JWT real — é flag `"sb_ok"`)
- Supabase RLS deve estar configurado para proteger tabelas contra acesso anon direto

---

## Deploy

1. Editar `SistemaAdmin.html`
2. Criar zip: `index.html` dentro do zip
3. Arrastar zip no painel do site Netlify (`monte-de-ouro-v15.netlify.app`)
4. Deploy é atômico — sem downtime para usuários ativos

**Versão atual:** v5 (`sorte_ouro_admin_v5.zip`)
