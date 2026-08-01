/* ModalidadesEngine v1.0 — carregado sob demanda */
// ─── ModalidadesEngine v1.0 (inline) ─────────────────────────────────────────
/**
 * ModalidadesEngine v1.0
 * Motor genérico de Modalidades do Jogo do Bicho.
 *
 * - Toda lógica de cálculo, conferência e validação baseia-se nos dados
 *   cadastrados em cada modalidade — nenhuma regra é hardcoded por nome.
 * - Compatível com CommonJS (Node/API), Browser puro e React Native (Android).
 * - Carrega modalidades do Supabase, de um array estático ou de ambos.
 *
 * Uso rápido:
 *   ModalidadesEngine.registrarTodas(arrayDeModalidades);
 *   var mod = ModalidadesEngine.obter('milhar');
 *   var ok  = ModalidadesEngine.validar(mod, ['1234'], 2.00);
 *   var custo = ModalidadesEngine.custo(mod, 2.00, 1, 3, 'dividido'); // 3 prêmios
 *   var ganho = ModalidadesEngine.ganho(mod, 2.00, 1, 1);             // acertou 1
 *   var conf  = ModalidadesEngine.conferir(mod, ['1234'], resultado, [1,2,3]);
 */

;(function(global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // CommonJS / Node.js / API
  } else {
    global.ModalidadesEngine = factory(); // Browser / WebView / APK
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {

  'use strict';

  // ─── Registro interno ────────────────────────────────────────────────────────
  var _db = {};          // { codigo: modalidade }
  var _cfg = {};         // config global (limites padrão, etc.)

  // ─── API Pública ─────────────────────────────────────────────────────────────

  /**
   * Carrega configuração global (opcional).
   * Ex: { limite_pagamento_global: 50000, moeda: 'BRL' }
   */
  function configurar(cfg) {
    _cfg = cfg || {};
  }

  /**
   * Registra uma modalidade individual.
   * @param {Object} m - objeto modalidade (campos do schema)
   */
  function registrar(m) {
    if (!m || !m.codigo) throw new Error('Modalidade inválida: campo "codigo" obrigatório.');
    _db[m.codigo] = _normalizar(m);
  }

  /**
   * Registra um array de modalidades de uma vez.
   * Ideal para carregar o resultado de: SELECT * FROM v_modalidades_ativas
   */
  function registrarTodas(lista) {
    (lista || []).forEach(registrar);
  }

  /**
   * Retorna a modalidade pelo código.
   * @returns {Object|null}
   */
  function obter(codigo) {
    return _db[(codigo || '').toLowerCase()] || null;
  }

  /**
   * Lista modalidades com filtros opcionais.
   * @param {Object} filtros - { ativo, categoria, tipo_base }
   */
  function listar(filtros) {
    var f = filtros || {};
    return Object.values(_db).filter(function(m) {
      if (f.ativo !== undefined   && m.ativo    !== f.ativo)    return false;
      if (f.categoria             && m.categoria !== f.categoria) return false;
      if (f.tipo_base             && m.tipo_base !== f.tipo_base) return false;
      return true;
    }).sort(function(a, b) { return a.ordem_exibicao - b.ordem_exibicao || a.id - b.id; });
  }

  // ─── Validação ───────────────────────────────────────────────────────────────

  /**
   * Valida uma aposta antes de submeter.
   * @param {Object}   mod       - modalidade
   * @param {string[]} numeros   - palpites (strings)
   * @param {number}   valor     - valor em reais (total ou por palpite)
   * @param {number[]} premios   - array de prêmios selecionados, ex: [1,2,3]
   * @returns {{ valido: boolean, erros: string[] }}
   */
  function validar(mod, numeros, valor, premios) {
    var erros = [];
    if (!mod) { return { valido: false, erros: ['Modalidade não encontrada.'] }; }
    if (!mod.ativo) { erros.push('Modalidade "' + mod.nome + '" está inativa.'); }

    var n = (numeros || []).length;
    if (n < mod.min_numeros) {
      erros.push('Mínimo de ' + mod.min_numeros + ' palpite(s). Informado: ' + n + '.');
    }
    if (mod.max_numeros && n > mod.max_numeros) {
      erros.push('Máximo de ' + mod.max_numeros + ' palpite(s). Informado: ' + n + '.');
    }
    if (!valor || isNaN(valor) || valor <= 0) {
      erros.push('Valor da aposta inválido.');
    } else {
      if (valor < mod.valor_minimo) {
        erros.push('Valor mínimo: R$ ' + _brNum(mod.valor_minimo) + '.');
      }
      if (mod.valor_maximo && valor > mod.valor_maximo) {
        erros.push('Valor máximo: R$ ' + _brNum(mod.valor_maximo) + '.');
      }
    }

    // Valida prêmios selecionados
    if (premios && premios.length) {
      var permitidos = mod.premios_possiveis;
      premios.forEach(function(p) {
        if (permitidos.indexOf(p) < 0) {
          erros.push('Prêmio ' + p + 'º não permitido nesta modalidade.');
        }
      });
    }

    // Valida dígitos de cada palpite
    if (mod.digitos > 0) {
      (numeros || []).forEach(function(num, i) {
        var s = String(num || '').replace(/\D/g, '');
        if (s.length !== mod.digitos) {
          erros.push('Palpite ' + (i+1) + ' deve ter exatamente ' + mod.digitos + ' dígito(s).');
        }
      });
    }

    return { valido: erros.length === 0, erros: erros };
  }

  // ─── Cálculo de Custo ────────────────────────────────────────────────────────

  /**
   * Calcula o custo total de uma aposta.
   *
   * Modos:
   *   'dividido'   — usuário informa o total a pagar; sistema divide pelos palpites/prêmios
   *   'por_premio' — usuário informa valor por prêmio; sistema multiplica por nPremios
   *   'por_palpite'— usuário informa valor por palpite; sistema multiplica por nPalpites
   *
   * @param {Object} mod
   * @param {number} valor       - valor digitado pelo usuário
   * @param {number} nPalpites   - quantidade de números/palpites
   * @param {number} nPremios    - quantidade de prêmios selecionados
   * @param {string} modo        - 'dividido'|'por_premio'|'por_palpite'
   * @returns {{ total: number, porPalpite: number, porPremio: number }}
   */
  function custo(mod, valor, nPalpites, nPremios, modo) {
    if (!mod || !valor) return { total: 0, porPalpite: 0, porPremio: 0 };
    var P  = Math.max(1, nPremios  || 1);
    var N  = Math.max(1, nPalpites || 1);
    var F  = mod.fator_combinacao || 1;  // ex: 2 para combinada, 3 para cercado
    var cm = P * F;                      // charge multiplier efetivo

    var total, porPalpite, porPremio;

    switch (modo || mod.metodo_divisao) {
      case 'dividido':
        // Usuário informa TOTAL → distribui pelos palpites e prêmios
        total      = valor;
        porPalpite = (N > 0 && cm > 0) ? valor / N / cm : valor;
        porPremio  = (N > 0 && P > 0)  ? valor / N / P  : valor;
        break;

      case 'por_premio':
        // Usuário informa valor que quer pagar POR PRÊMIO
        total      = valor * P * (N > 1 ? N : 1) * F;
        porPalpite = valor * P * F;
        porPremio  = valor;
        break;

      case 'por_palpite':
      default:
        // Usuário informa valor POR PALPITE → multiplica por N e prêmios
        total      = valor * N * cm;
        porPalpite = valor;
        porPremio  = (P > 0) ? valor * F : valor;
        break;
    }

    return { total: _round(total), porPalpite: _round(porPalpite), porPremio: _round(porPremio) };
  }

  /**
   * Calcula o ganho potencial máximo de uma aposta.
   * @param {Object} mod
   * @param {number} valorPorPalpite - valor unitário por aposta/palpite
   * @param {number} nAcertos        - quantidade de palpites que acertaram
   * @param {number} nPremios        - prêmios cobertos (para divisão de cotação)
   * @returns {number} ganho total em reais
   */
  function ganho(mod, valorPorPalpite, nAcertos, nPremios) {
    if (!mod || !valorPorPalpite || !nAcertos) return 0;
    var P  = Math.max(1, nPremios || 1);
    var F  = mod.fator_combinacao || 1;
    // Cotação base dividida pelos prêmios
    var cotacaoEfetiva = (mod.metodo_divisao === 'dividido')
      ? mod.cotacao / P / F
      : mod.cotacao;
    var ganhoTotal = valorPorPalpite * cotacaoEfetiva * nAcertos;

    // Aplicar limite de pagamento
    var limite = mod.limite_pagamento || _cfg.limite_pagamento_global || Infinity;
    return _round(Math.min(ganhoTotal, limite));
  }

  /**
   * Preview de ganho potencial (para mostrar ao apostador antes de confirmar).
   * @param {Object} mod
   * @param {number} totalAposta - custo total da aposta
   * @param {number} nPalpites
   * @param {number} nPremios
   * @returns {{ potencialGanho: number, cotacaoEfetiva: number, descricao: string }}
   */
  function preview(mod, totalAposta, nPalpites, nPremios) {
    if (!mod || !totalAposta) return null;
    var P   = Math.max(1, nPremios  || 1);
    var N   = Math.max(1, nPalpites || 1);
    var F   = mod.fator_combinacao || 1;
    var cm  = P * F;
    var valorUnitario = (mod.metodo_divisao === 'dividido' && N > 0 && cm > 0)
      ? totalAposta / N / cm
      : totalAposta / N;
    var cotEfetiva = mod.cotacao / F;  // cotação não divide por P (cada prêmio paga igual)
    var ganhoUnitario = valorUnitario * cotEfetiva;
    var limite = mod.limite_pagamento || _cfg.limite_pagamento_global || Infinity;
    ganhoUnitario = Math.min(ganhoUnitario, limite);

    var descricao = '1º' + (P > 1 ? ' ao ' + P + 'º prêmio' : ' prêmio');

    return {
      potencialGanho: _round(ganhoUnitario),
      cotacaoEfetiva: _round(cotEfetiva),
      descricao:      descricao
    };
  }

  // ─── Conferência ─────────────────────────────────────────────────────────────

  /**
   * Confere uma aposta contra o resultado de um sorteio.
   *
   * @param {Object}   mod      - modalidade
   * @param {string[]} numeros  - palpites apostados, ex: ['1234', '5678']
   * @param {Object}   resultado - objeto de resultado do sorteio:
   *                              {
   *                                premios: [
   *                                  { posicao: 1, milhar: '1234', centena: '234', dezena: '34', grupo: 5, animal: 'Leão' },
   *                                  ...
   *                                ]
   *                              }
   * @param {number[]} premiosSelecionados - ex: [1,2,3] (prêmios apostados)
   * @returns {{
   *   ganhou: boolean,
   *   acertos: Array<{ numero: string, posicao: number, chave: string }>,
   *   ganhoTotal: number,
   *   detalhes: string
   * }}
   */
  function conferir(mod, numeros, resultado, premiosSelecionados) {
    if (!mod || !numeros || !resultado) {
      return { ganhou: false, acertos: [], ganhoTotal: 0, detalhes: 'Dados insuficientes.' };
    }

    var premios = premiosSelecionados || mod.premios_padrao || [1];
    var acertos = [];

    // Filtra apenas os prêmios selecionados
    var premiosDoSorteio = (resultado.premios || []).filter(function(p) {
      return premios.indexOf(p.posicao) >= 0;
    });

    numeros.forEach(function(numero) {
      var numStr = String(numero || '').replace(/\D/g, '');

      premiosDoSorteio.forEach(function(premio) {
        // Gera variações do número a checar de acordo com a modalidade
        var variantes = _gerarVariantes(mod, numStr, premio);

        variantes.forEach(function(variante) {
          if (_checarAcerto(mod, numStr, variante, premio)) {
            acertos.push({
              numero:    numStr,
              posicao:   premio.posicao,
              chave:     variante.chave,
              animal:    premio.animal || ''
            });
          }
        });
      });
    });

    // Remove duplicatas (mesmo número + posição)
    var uniq = [];
    var seen = {};
    acertos.forEach(function(a) {
      var k = a.numero + '_' + a.posicao;
      if (!seen[k]) { seen[k] = true; uniq.push(a); }
    });

    var ganhouTotal = 0;
    uniq.forEach(function(a) {
      ganhouTotal += mod.cotacao; // simplificado — o chamador deve multiplicar pelo valor unitário
    });

    return {
      ganhou:     uniq.length > 0,
      acertos:    uniq,
      ganhoTotal: _round(ganhouTotal), // multiplicador — multiplique pelo valorPorPalpite
      detalhes:   uniq.length > 0
        ? 'Acertou ' + uniq.length + ' vez(es)!'
        : 'Não acertou.'
    };
  }

  // ─── Utilitários de apresentação ─────────────────────────────────────────────

  /**
   * Formata o label de prêmios selecionados para exibição.
   * Ex: [1] → "1º P"  |  [1,2,3] → "1-3 P"
   */
  function labelPremios(premios) {
    var p = (premios || []).slice().sort(function(a,b){return a-b;});
    if (!p.length) return '–';
    if (p.length === 1) return p[0] + 'º P';
    return p[0] + '-' + p[p.length - 1] + ' P';
  }

  /**
   * Retorna o bet_type da API com sufixo de prêmio.
   * Ex: obterBetType('milhar', [1,3]) → 'milhar_1_3'
   */
  function obterBetType(codigo, premios) {
    var base = (codigo || '').toLowerCase().replace(/_\d+(?:_\d+)?$/, '');
    var p = (premios || []).slice().sort(function(a,b){return a-b;});
    if (!p.length || (p.length === 1 && p[0] === 1)) return base;
    return base + '_' + p[0] + '_' + p[p.length - 1];
  }

  /**
   * Parse de um bet_type da API para { codigo, premios[] }.
   * Ex: 'milhar_1_5' → { codigo: 'milhar', premios: [1,2,3,4,5] }
   */
  function parseBetType(betType) {
    var bt   = (betType || '').toLowerCase();
    var m    = bt.match(/_(\d+)(?:_(\d+))?$/);
    var base = bt.replace(/_\d+(?:_\d+)?$/, '');
    if (!m) return { codigo: base, premios: [1] };
    var ps = parseInt(m[1]);
    var pe = m[2] ? parseInt(m[2]) : ps;
    var premios = [];
    for (var i = ps; i <= pe; i++) premios.push(i);
    return { codigo: base, premios: premios };
  }

  // ─── Funções internas ────────────────────────────────────────────────────────

  function _normalizar(m) {
    return {
      id:                m.id              || 0,
      nome:              m.nome            || m.label || '',
      codigo:            (m.codigo         || m.bet_type || '').toLowerCase(),
      categoria:         m.categoria       || 'simples',
      tipo_base:         m.tipo_base       || 'dezena',
      digitos:           Number(m.digitos  || m.q || 2),
      min_numeros:       Number(m.min_numeros || m.min || 1),
      max_numeros:       m.max_numeros     != null ? Number(m.max_numeros) : null,
      is_grupo:          !!(m.is_grupo     || m.g),
      ordem_importa:     !!m.ordem_importa,
      gera_combinacoes:  !!m.gera_combinacoes,
      permite_inversao:  !!m.permite_inversao,
      fator_combinacao:  Number(m.fator_combinacao || m.factor || 1),
      premios_possiveis: m.premios_possiveis || [1,2,3,4,5],
      premios_padrao:    m.premios_padrao    || [1],
      max_premios:       Number(m.max_premios || 5),
      cotacao:           Number(m.cotacao     || m.multiplier || 1),
      metodo_divisao:    m.metodo_divisao    || 'dividido',
      charge_multiplier: Number(m.charge_multiplier || 1),
      valor_minimo:      Number(m.valor_minimo  || 0.50),
      valor_maximo:      m.valor_maximo    != null ? Number(m.valor_maximo) : null,
      limite_pagamento:  m.limite_pagamento != null ? Number(m.limite_pagamento) : null,
      ativo:             m.ativo !== false,
      ordem_exibicao:    Number(m.ordem_exibicao || 0)
    };
  }

  function _gerarVariantes(mod, numStr, premio) {
    var variantes = [{ chave: numStr, valor: _extrairChave(mod, numStr, premio) }];

    if (mod.gera_combinacoes || mod.permite_inversao) {
      // Gera permutações do número
      var perms = _permutacoes(numStr);
      perms.forEach(function(p) {
        if (p !== numStr) {
          variantes.push({ chave: p, valor: _extrairChave(mod, p, premio) });
        }
      });
    }

    return variantes;
  }

  function _checarAcerto(mod, numStr, variante, premio) {
    var tipo = mod.tipo_base;
    var chave = variante.valor;

    if (tipo === 'milhar')  return chave === premio.milhar;
    if (tipo === 'centena') return chave === premio.centena;
    if (tipo === 'dezena')  return chave === premio.dezena;
    if (tipo === 'grupo')   return Number(chave) === Number(premio.grupo);
    return false;
  }

  function _extrairChave(mod, numStr, premio) {
    var tipo = mod.tipo_base;
    if (tipo === 'milhar')  return numStr.slice(-4);
    if (tipo === 'centena') return numStr.slice(-3);
    if (tipo === 'dezena')  return numStr.slice(-2);
    if (tipo === 'grupo')   return _dezenaPraGrupo(numStr.slice(-2));
    return numStr;
  }

  function _dezenaPraGrupo(dezena) {
    var d = parseInt(dezena, 10);
    if (isNaN(d)) return null;
    return Math.ceil(d === 0 ? 25 : d / 4);
  }

  // Gera todas as permutações únicas de uma string numérica (máx 4 dígitos)
  function _permutacoes(str) {
    if (str.length <= 1) return [str];
    var result = {};
    for (var i = 0; i < str.length; i++) {
      var rest = str.slice(0, i) + str.slice(i + 1);
      var perms = _permutacoes(rest);
      perms.forEach(function(p) { result[str[i] + p] = true; });
    }
    return Object.keys(result);
  }

  function _round(v) { return Math.round((v || 0) * 100) / 100; }
  function _brNum(v) { return Number(v || 0).toFixed(2).replace('.', ','); }

  // ─── Export ──────────────────────────────────────────────────────────────────
  return {
    // Registro
    configurar:    configurar,
    registrar:     registrar,
    registrarTodas:registrarTodas,
    // Consulta
    obter:         obter,
    listar:        listar,
    // Operações
    validar:       validar,
    custo:         custo,
    ganho:         ganho,
    preview:       preview,
    conferir:      conferir,
    // Utilidades
    labelPremios:  labelPremios,
    obterBetType:  obterBetType,
    parseBetType:  parseBetType
  };

}));

// ─── Carregar modalidades do Supabase ────────────────────────────────────────
function loadModalidades() {
  sbGet('v_modalidades_ativas', 'order=ordem_exibicao')
    .then(function(rows) {
      var lista = Array.isArray(rows) ? rows : (rows && rows.data ? rows.data : []);
      if (lista.length) {
        ModalidadesEngine.registrarTodas(lista);
        console.log('[ME] ' + lista.length + ' modalidades carregadas.');
      }
    })
    .catch(function(e) { console.warn('[ME] Erro ao carregar modalidades:', e); });
}

// ─── Extras ──────────────────────────────────────────────────────────────────
function aviso(f) { alert(f + '\nEm desenvolvimento.'); }

// ── RESULTADOS ──────────────────────────────────────────────
function abrirResultados() {
  go('s-resultados');
  carregarResultados();
}
function carregarResultados() {
  var el = document.getElementById('list-resultados');
  el.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Carregando...</div>';
  api('/draws/results').then(function(lista) {
    _resultadosCache = toArray(lista);
    lista = toArray(lista);
    if (!lista.length) {
      el.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Nenhum resultado publicado.</div>';
      return;
    }
    el.innerHTML = '';
    lista.forEach(function(s, idx) {
      var resultado = s.result != null ? String(s.result).trim() : '';
      var data = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR') : '';
      var hora = s.hora ? s.hora.substring(0,5) : '';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:4px solid #2E7D32';
      // cabeçalho do card
      var headerHtml =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:14px;color:#1B4332">' + (s.title || 'Sorteio #' + s.id) + '</div>' +
            '<div style="font-size:12px;color:#888;margin-top:2px">' + data + (hora ? ' · ' + hora : '') + '</div>' +
          '</div>' +
          '<button onclick="imprimirBilheteResultado(' + idx + ')" style="background:#2E7D32;border:none;border-radius:8px;color:#fff;font-size:15px;padding:6px 10px;cursor:pointer" title="Imprimir">🖨</button>' +
        '</div>';
      // corpo: resultado formatado (multi-linha) ou fallback
      var bodyHtml = '';
      if (resultado) {
        // detecta se é multi-linha (formato 01  XXXX  NN - ANIMAL)
        if (resultado.indexOf('\n') >= 0 || /^\d{2}\s/.test(resultado)) {
          var linhas = resultado.split('\n').filter(function(l){ return l.trim(); });
          bodyHtml = '<div style="background:#F1F8E9;border-radius:6px;padding:10px">';
          linhas.forEach(function(linha) {
            var partes = linha.trim().match(/^(\d{2})\s+(\d{4})\s+(\d{1,2})\s*-\s*(.+)$/);
            if (partes) {
              bodyHtml +=
                '<div style="display:flex;gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid #E8F5E9">' +
                  '<span style="font-weight:700;color:#555;font-size:12px;width:20px">' + partes[1] + '</span>' +
                  '<span style="font-family:monospace;font-weight:700;font-size:16px;color:#1B4332;width:48px">' + partes[2] + '</span>' +
                  '<span style="font-size:12px;color:#388E3C;width:20px;text-align:center">' + partes[3] + '</span>' +
                  '<span style="font-size:13px;color:#333;font-weight:600">' + partes[4].trim() + '</span>' +
                '</div>';
            } else {
              bodyHtml += '<div style="font-size:13px;color:#444;padding:2px 0">' + linha.trim() + '</div>';
            }
          });
          bodyHtml += '</div>';
        } else {
          // resultado simples (número ou texto curto)
          bodyHtml = '<div style="background:#E8F5E9;padding:8px 14px;border-radius:20px;font-weight:700;font-size:20px;color:#2E7D32;display:inline-block">' + resultado + '</div>';
        }
      } else {
        bodyHtml = '<div style="color:#aaa;font-size:13px">Resultado não informado</div>';
      }
      card.innerHTML = headerHtml + bodyHtml;
      el.appendChild(card);
    });
  }).catch(function(e) {
    el.innerHTML = '<div style="color:#c62828;padding:20px">Erro: ' + e.message + '</div>';
  });
}

// ── REPETIR ──────────────────────────────────────────────────
var _repBets = null;
function abrirRepetir() {
  go('s-repetir');
  document.getElementById('inp-repetir-cod').value = '';
  document.getElementById('rep-preview').style.display = 'none';
  document.getElementById('rep-msg').style.display = 'none';
  _repBets = null;
  carregarRecentes();
}
function carregarRecentes() {
  var el = document.getElementById('list-repetir-recentes');
  if (!st.user) { el.innerHTML = '<div style="color:#aaa;font-size:13px">Faça login para ver recentes.</div>'; return; }
  sbGet('apostas', 'user_id=eq.' + st.user.id + '&order=created_at.desc&limit=50')
    .then(function(lista) {
      lista = toArray(lista);
      // Deduplica por ticket_code preservando ordem
      var seen = {}, codes = [];
      lista.forEach(function(b) { var c = b.ticket_code; if (c && !seen[c]) { seen[c] = true; codes.push(c); } });
      codes = codes.slice(0, 6);
      if (!codes.length) { el.innerHTML = '<div style="color:#aaa;font-size:13px">Sem bilhetes recentes.</div>'; return; }
      el.innerHTML = '';
      codes.forEach(function(code) {
        var btn = document.createElement('button');
        btn.style.cssText = 'display:block;width:100%;text-align:left;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;margin-bottom:6px;font-family:monospace;font-size:13px;cursor:pointer;color:#333';
        btn.textContent = code;
        btn.onclick = function() { document.getElementById('inp-repetir-cod').value = code; buscarBilhete(); };
        el.appendChild(btn);
      });
    }).catch(function() { el.innerHTML = '<div style="color:#aaa;font-size:13px">Não foi possível carregar.</div>'; });
}
function buscarBilhete() {
  var code = document.getElementById('inp-repetir-cod').value.trim().toUpperCase();
  var msg = document.getElementById('rep-msg');
  var prev = document.getElementById('rep-preview');
  msg.style.display = 'none'; prev.style.display = 'none'; _repBets = null;
  if (!code) { msg.textContent = 'Digite um código de bilhete.'; msg.style.display = 'block'; return; }
  api('/bets/ticket/' + code).then(function(lista) {
    lista = toArray(lista);
    if (!lista.length) {
      msg.textContent = 'Bilhete "' + code + '" não encontrado.';
      msg.style.display = 'block'; return;
    }
    _repBets = lista;
    var total = lista.reduce(function(s, b) { return s + Number(b.amount || 0); }, 0);
    var lines = lista.map(function(b) {
      var nums = typeof b.numbers === 'string' ? b.numbers : JSON.stringify(b.numbers);
      return '  ' + (b.bet_type || '–') + ' · ' + nums + ' · R$' + Number(b.amount).toFixed(2);
    });
    document.getElementById('rep-prev-title').textContent = 'Bilhete ' + code + ' · R$' + total.toFixed(2);
    document.getElementById('rep-prev-body').textContent = lines.join('\n');
    prev.style.display = 'block';
  }).catch(function(e) { msg.textContent = 'Erro: ' + e.message; msg.style.display = 'block'; });
}
function confirmarRepetir() {
  if (!_repBets || !_repBets.length) return;
  var bets = _repBets.map(function(b) {
    return { draw_id: b.draw_id, bet_type: b.bet_type, numbers: typeof b.numbers === 'string' ? b.numbers : JSON.stringify(b.numbers), amount: Number(b.amount) };
  });
  var btn = document.querySelector('#rep-preview button');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  var payload = JSON.stringify({ bets: bets });
  api('/bets/batch', { method: 'POST', body: payload, noAutoLogout: true }).then(function(res) {
    var tid = res.ticketId || res.ticket_id || '–';
    var total = Number(res.totalAmount || res.total_amount || 0).toFixed(2);
    alert('✅ Bilhete repetido com sucesso!\nNovo código: ' + tid + '\nTotal: R$ ' + total);
    go('s-main');
  }).catch(function(e) {
    alert('Erro ao repetir bilhete:\n' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🔁 Repetir Este Bilhete'; }
  });
}

// ── CAIXA ────────────────────────────────────────────────────
var _caixaTab = 'hoje';
function abrirCaixa() {
  go('s-caixa');
  _caixaTab = 'hoje';
  setCaixaTab('hoje');
}
function setCaixaTab(tab) {
  _caixaTab = tab;
  var tHoje   = document.getElementById('cx-tab-hoje');
  var tResumo = document.getElementById('cx-tab-resumo');
  tHoje.style.color   = tab === 'hoje'   ? '#1B4332' : '#888';
  tHoje.style.borderBottomColor   = tab === 'hoje'   ? '#2E7D32' : 'transparent';
  tResumo.style.color = tab === 'resumo' ? '#1B4332' : '#888';
  tResumo.style.borderBottomColor = tab === 'resumo' ? '#2E7D32' : 'transparent';
  carregarCaixa();
}
function carregarCaixa() {
  var el = document.getElementById('caixa-content');
  el.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Carregando...</div>';
  var rota = _caixaTab === 'hoje' ? '/caixa/hoje' : '/caixa/geral';
  api(rota).then(function(lista) {
    _caixaCache = toArray(lista);
    lista = toArray(lista);
    var total = lista.reduce(function(s, b) { return s + Number(b.amount || 0); }, 0);
    var totalBilhetes = (function() {
      var set = {}; lista.forEach(function(b) { if (b.ticket_code) set[b.ticket_code] = 1; }); return Object.keys(set).length;
    })();
    var totalApostas = lista.length;
    var titulo = _caixaTab === 'hoje' ? 'Relatório de Hoje' : 'Relatório Geral';
    // Agrupar por ticket_code para exibir
    var ticketMap = {}; var ticketOrder = [];
    lista.forEach(function(b) {
      var tc = b.ticket_code || 'sem-código';
      if (!ticketMap[tc]) { ticketMap[tc] = []; ticketOrder.push(tc); }
      ticketMap[tc].push(b);
    });
    var html2 = '<div style="background:#2E7D32;color:#fff;border-radius:10px;padding:16px;margin-bottom:14px">' +
      '<div style="font-size:12px;opacity:.8;margin-bottom:4px">' + titulo + '</div>' +
      '<div style="font-size:28px;font-weight:700">R$ ' + total.toFixed(2).replace('.',',') + '</div>' +
      '<div style="font-size:12px;margin-top:6px;opacity:.85">' + totalBilhetes + ' bilhete(s) · ' + totalApostas + ' aposta(s)</div>' +
    '</div>';
    if (!ticketOrder.length) {
      html2 += '<div style="text-align:center;color:#888;padding:20px">Nenhuma aposta no período.</div>';
    } else {
      ticketOrder.slice(0, 50).forEach(function(tc) {
        var bets = ticketMap[tc];
        var tVal = bets.reduce(function(s, b) { return s + Number(b.amount || 0); }, 0);
        var dt = bets[0] && bets[0].created_at ? new Date(bets[0].created_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        html2 += '<div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.08)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div style="font-family:monospace;font-size:11px;color:#555">' + tc + '</div>' +
            '<div style="font-weight:700;color:#2E7D32">R$ ' + tVal.toFixed(2).replace('.',',') + '</div>' +
          '</div>' +
          '<div style="font-size:11px;color:#aaa;margin-top:3px">' + dt + ' · ' + bets.length + ' aposta(s)</div>' +
        '</div>';
      });
      if (ticketOrder.length > 50) {
        html2 += '<div style="text-align:center;color:#aaa;font-size:12px;padding:8px">+ ' + (ticketOrder.length - 50) + ' bilhete(s) não exibidos</div>';
      }
    }
    el.innerHTML = html2;
  }).catch(function(e) {
    el.innerHTML = '<div style="color:#c62828;padding:20px">Erro: ' + e.message + '</div>';
  });
}

// ── SENHA ────────────────────────────────────────────────────
function abrirSenha() {
  go('s-senha');
  document.getElementById('inp-senha-atual').value = '';
  document.getElementById('inp-senha-nova').value = '';
  document.getElementById('inp-senha-conf').value = '';
  var msg = document.getElementById('senha-msg');
  msg.style.display = 'none';
}
function salvarSenha() {
  var atual = document.getElementById('inp-senha-atual').value;
  var nova  = document.getElementById('inp-senha-nova').value;
  var conf  = document.getElementById('inp-senha-conf').value;
  var msg   = document.getElementById('senha-msg');
  function showMsg(txt, ok) {
    msg.textContent = txt;
    msg.style.background = ok ? '#E8F5E9' : '#FFEBEE';
    msg.style.color = ok ? '#2E7D32' : '#c62828';
    msg.style.display = 'block';
  }
  if (!atual || !nova) return showMsg('Preencha todos os campos.', false);
  if (nova.length < 4) return showMsg('Nova senha deve ter ao menos 4 caracteres.', false);
  if (nova !== conf)  return showMsg('Nova senha e confirmação não coincidem.', false);
  var bodyStr = JSON.stringify({ senha_atual: atual, nova_senha: nova });
  api('/change-password', { method: 'POST', body: bodyStr }).then(function() {
    showMsg('✅ Senha alterada com sucesso!', true);
    document.getElementById('inp-senha-atual').value = '';
    document.getElementById('inp-senha-nova').value = '';
    document.getElementById('inp-senha-conf').value = '';
  }).catch(function(e) { showMsg('Erro: ' + (e.message || 'Tente novamente.'), false); });
}

// ── COTAÇÕES ─────────────────────────────────────────────────
function abrirCotacoes() {
  go('s-cotacoes');
  carregarCotacoes();
}
function carregarCotacoes() {
  var el = document.getElementById('list-cotacoes');
  el.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Carregando...</div>';
  sbGet('modality_settings', 'is_active=eq.true&order=id.asc').then(function(lista) {
    _cotacoesCache = toArray(lista);
    lista = toArray(lista);
    if (!lista.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Sem cotações disponíveis.</div>'; return; }
    var html2 = '';
    lista.forEach(function(c) {
      var mult = (c.cotacao != null && Number(c.cotacao) > 0) ? Number(c.cotacao).toLocaleString('pt-BR') + 'x' : (c.multiplier != null ? Number(c.multiplier).toLocaleString('pt-BR') + 'x' : '–');
      var cm   = c.charge_multiplier != null && c.charge_multiplier > 1 ? ' · 1 a ' + c.charge_multiplier + 'P' : '';
      html2 += '<div style="background:#fff;border-radius:8px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.08);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-weight:600;font-size:14px;color:#1B4332">' + (c.label || c.bet_type || '–') + '</div>' +
          '<div style="font-size:11px;color:#888;margin-top:2px">' + (c.bet_type || '') + cm + '</div>' +
        '</div>' +
        '<div style="background:#E8F5E9;padding:5px 12px;border-radius:16px;font-weight:700;font-size:15px;color:#2E7D32">' + mult + '</div>' +
      '</div>';
    });
    el.innerHTML = html2;
  }).catch(function(e) {
    el.innerHTML = '<div style="color:#c62828;padding:20px">Erro: ' + e.message + '</div>';
  });
}

// ── IMPRESSÃO GENÉRICA DE TELAS ──────────────────────────────────────────────
// Cache dos dados carregados para gerar texto fallback
var _resultadosCache = [];
var _caixaCache      = [];
var _cotacoesCache   = [];

function _imprimirTelaGenerica(hideIds, getTextFn) {
  if (!window.NativePrinter) { alert('Impressora não disponível neste dispositivo.'); return; }

  // Esconde elementos de navegação para impressão limpa
  var hidden = [];
  hideIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.style.display = 'none'; hidden.push(el); }
  });

  var tmr = setTimeout(function() {
    hidden.forEach(function(el) { el.style.display = ''; });
    alert('Timeout: impressora não respondeu.');
  }, 15000);

  window._printCallback = function(res) {
    clearTimeout(tmr);
    hidden.forEach(function(el) { el.style.display = ''; });
    if (!res || !res.ok) {
      // Fallback: texto ESC/POS
      var txt = getTextFn();
      if (txt) {
        try {
          var raw = window.NativePrinter.printText(txt);
          var r; try { r = JSON.parse(raw); } catch(e) {}
          if (!r || !r.ok) alert('Falha ao imprimir. Verifique a impressora.');
        } catch(e2) { alert('Erro: ' + e2.message); }
      }
    }
  };

  setTimeout(function() {
    try { window.NativePrinter.printScreen(); }
    catch(e) {
      clearTimeout(tmr);
      hidden.forEach(function(el) { el.style.display = ''; });
      var txt = getTextFn();
      if (txt) { try { window.NativePrinter.printText(txt); } catch(e2) {} }
    }
  }, 250);
}

// ── Bilhete individual de resultado ──────────────────────────────────────────
function imprimirBilheteResultado(idx) {
  var s = _resultadosCache[idx];
  if (!s) return;
  if (!window.NativePrinter) { alert('Impressora não disponível neste dispositivo.'); return; }
  var SEP  = '================================';
  var W    = 32;
  var data = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  var hora = s.hora ? s.hora.substring(0, 5) : '';
  var extr = s.title || ('Sorteio #' + s.id);
  var agora = new Date().toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  var t = '\n';
  t += centrar('MONTE DE OURO', W) + '\n';
  t += ' \n';
  t += colunas('Data:', data, W) + '\n';
  t += 'Extracao: ' + extr + (hora ? ' ' + hora + ' HS' : '') + '\n';
  t += ' \n';

  // resultado pode ser multi-linha (formato: "01  4946  12 - ELEFANTE\n...")
  if (s.result != null) {
    var linhas = String(s.result).trim().split('\n');
    linhas.forEach(function(linha) {
      if (linha.trim()) t += linha + '\n';
    });
  } else {
    t += centrar('Sem resultado', W) + '\n';
  }

  t += ' \n';
  t += SEP + '\n';
  t += centrar('Impresso: ' + agora, W) + '\n';
  t += '\n';

  try {
    var raw = window.NativePrinter.printText(t);
    var r   = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!r || !r.ok) alert('Falha ao imprimir. Verifique a impressora.');
  } catch(e) {
    try { window.NativePrinter.printScreen(); } catch(e2) {}
  }
}

// ── Imprimir 2ª via (tela Repetir) ───────────────────────────────────────────
function imprimirRepetir() {
  if (!_repBets || !_repBets.length) { alert('Nenhum bilhete carregado para imprimir.'); return; }
  if (!window.NativePrinter) { alert('Impressora não disponível neste dispositivo.'); return; }
  var SEP   = '================================';
  var W     = 32;
  var code  = document.getElementById('inp-repetir-cod').value.trim().toUpperCase();
  var total = _repBets.reduce(function(acc, b) { return acc + Number(b.amount || 0); }, 0);
  var agora = new Date().toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  var t = '\n';
  t += centrar('MONTE DE OURO', W) + '\n';
  t += centrar('2a VIA DO BILHETE', W) + '\n';
  t += SEP + '\n';
  t += colunas('Bilhete:', code, W) + '\n';
  t += colunas('Total:', 'R$ ' + total.toFixed(2), W) + '\n';
  t += SEP + '\n';
  _repBets.forEach(function(b, i) {
    var nums = typeof b.numbers === 'string' ? b.numbers : JSON.stringify(b.numbers);
    t += (i + 1) + '. ' + (b.bet_type || '–') + '\n';
    t += '   Nums: ' + nums + '\n';
    t += '   Valor: R$ ' + Number(b.amount).toFixed(2) + '\n';
  });
  t += SEP + '\n';
  t += centrar('Impresso: ' + agora, W) + '\n';
  t += '\n';

  try {
    var raw = window.NativePrinter.printText(t);
    var r   = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!r || !r.ok) alert('Falha ao imprimir. Verifique a impressora.');
  } catch(e) {
    try { window.NativePrinter.printScreen(); } catch(e2) {}
  }
}

// ── Imprimir Resultados (lista completa) ─────────────────────────────────────
function imprimirResultados() {
  _imprimirTelaGenerica(
    ['res-btn-back', 'res-btn-print', 'res-btn-ref'],
    function() {
      var SEP   = '================================';
      var W     = 32;
      var agora = new Date().toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var t     = centrar('MONTE DE OURO', W) + '\n';
      t += centrar('RESULTADOS DO DIA', W) + '\n';
      t += centrar(agora, W) + '\n';
      t += SEP + '\n';
      _resultadosCache.forEach(function(s) {
        var data = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR') : '';
        var hora = s.hora ? s.hora.substring(0,5) : '';
        var extr = s.title || ('Sorteio #' + s.id);
        t += ' \n';
        t += colunas('Data:', data, W) + '\n';
        t += 'Extracao: ' + extr + (hora ? ' ' + hora + ' HS' : '') + '\n';
        t += ' \n';
        if (s.result != null) {
          String(s.result).trim().split('\n').forEach(function(linha) {
            if (linha.trim()) t += linha + '\n';
          });
        }
        t += SEP + '\n';
      });
      if (!_resultadosCache.length) t += centrar('Sem resultados', W) + '\n';
      return t;
    }
  );
}

// ── Imprimir Caixa ────────────────────────────────────────────────────────────
function imprimirCaixa() {
  _imprimirTelaGenerica(
    ['cx-btn-back', 'cx-btn-print', 'cx-btn-ref', 'cx-tab-hoje', 'cx-tab-resumo'],
    function() {
      var lista = _caixaCache;
      var total = lista.reduce(function(s, b) { return s + Number(b.amount || 0); }, 0);
      var ticketSet = {};
      lista.forEach(function(b) { if (b.ticket_code) ticketSet[b.ticket_code] = 1; });
      var totalBilhetes = Object.keys(ticketSet).length;
      var SEP = '================================';
      var W   = 32;
      var titulo = _caixaTab === 'hoje' ? 'RELATORIO DO DIA' : 'RELATORIO GERAL';
      var agora = new Date().toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var t = centrar('MONTE DE OURO', W) + '\n';
      t += centrar(titulo, W) + '\n';
      t += centrar(agora, W) + '\n';
      t += SEP + '\n';
      t += colunas('Total vendido:', 'R$ ' + total.toFixed(2), W) + '\n';
      t += colunas('Bilhetes:', String(totalBilhetes), W) + '\n';
      t += colunas('Apostas:', String(lista.length), W) + '\n';
      t += SEP + '\n';
      // Agrupar por ticket
      var ticketMap = {}, ticketOrder = [];
      lista.forEach(function(b) {
        var tc = b.ticket_code || 'sem-cod';
        if (!ticketMap[tc]) { ticketMap[tc] = { val: 0, cnt: 0, dt: b.created_at }; ticketOrder.push(tc); }
        ticketMap[tc].val += Number(b.amount || 0);
        ticketMap[tc].cnt++;
      });
      ticketOrder.slice(0, 30).forEach(function(tc) {
        var info = ticketMap[tc];
        var dtStr = info.dt ? new Date(info.dt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        t += tc + '\n';
        t += '  ' + dtStr + ' · R$ ' + info.val.toFixed(2) + ' (' + info.cnt + 'ap)\n';
      });
      if (ticketOrder.length > 30) t += '... +' + (ticketOrder.length - 30) + ' bilhetes\n';
      t += SEP + '\n';
      return t;
    }
  );
}

// ── Imprimir Cotações ─────────────────────────────────────────────────────────
function imprimirCotacoes() {
  _imprimirTelaGenerica(
    ['cot-btn-back', 'cot-btn-print', 'cot-btn-ref'],
    function() {
      var SEP = '================================';
      var W   = 32;
      var t   = centrar('MONTE DE OURO', W) + '\n';
      t += centrar('COTACOES', W) + '\n';
      t += SEP + '\n';
      _cotacoesCache.forEach(function(c) {
        var mult = c.multiplier != null ? Number(c.multiplier).toLocaleString('pt-BR') + 'x' : '-';
        var cm   = c.charge_multiplier > 1 ? ' 1a' + c.charge_multiplier + 'P' : '';
        t += colunas((c.label || c.bet_type || '-') + cm + ':', mult, W) + '\n';
      });
      t += SEP + '\n';
      return t;
    }
  );
}
