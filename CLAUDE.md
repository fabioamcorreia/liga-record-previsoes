# Liga Record – Previsões

Projeto para gerir a equipa do utilizador na **Liga Record 2026/27** (fantasy do jornal Record, https://liga.record.pt/info/ajuda.aspx) e prever os pontos de cada jogador por jornada. Responder sempre em **português de Portugal**.

## Regras da Liga Record (regulamento 2026/27)

- **Orçamento** 40 M€ (+ bónus). **Plantel** 23: 3 GR, 8 DEF, 8 MED, 4 AV. Sem limite por clube. Cotação mínima 0,5 M€.
- **Onze**: 1 GR, 3-5 DEF, 3-5 MED, 1-3 AV. Táticas válidas: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1.
- **Suplentes**: 4, só **3 entram**, só substituem a **mesma posição**, pela **ordem do banco**. Se o capitão é substituído, o suplente herda a braçadeira.
- **Treinador**: 1 por ronda, sem custo. Sem onze + 4 suplentes + treinador → 0 pontos.
- **Transferências**: 1 por jornada (mesma posição, dentro do orçamento). Fevereiro: até 6 trocas. Extra: +2 se um jogador muda de posição, +1 se muda de liga.
- **Fecho**: 15 min antes do 1.º jogo da jornada.
- **Férias**: 3 vezes na época (não nas últimas 3), metade dos pontos do vencedor da ronda.
- **Rondas**: ronda 1 = 6.ª jornada da Liga (`ROUND_OFFSET = 5`); 29 rondas. Inverno: rondas 1-12; verão: 13-29.
- **Valorização**: 4-5 pts +50 mil €; 6-9 +100 mil; 10+ +150 mil; 0 pts −50 mil; negativo −100 mil. Se desvaloriza, o utilizador recebe a diferença no saldo; se valoriza, mantém o preço de compra.

### Pontuação dos jogadores
| Evento | GR | DEF | MED | AV |
|---|---|---|---|---|
| Golo (sem ser penálti) | +20 | +4 | +3 | +2 |
| Penálti marcado | +2 | +2 | +2 | +2 |
| Golo sofrido pela equipa | −2 | −1 | 0 | 0 |
| Equipa sem sofrer | +2 | +1 | 0 | 0 |
- Nota Record 0-5 → 0, 1, 2, 3, 4, **7** pontos. Vitória +1 a quem jogou. Hat-trick +5. Penálti falhado −2, defendido (GR) +2. Autogolo −2. Vermelho direto −3, duplo amarelo −1 (mesmo no banco). **AV sem marcar com 75'+ → −1.** Não utilizado −1. Jogador da Semana +5. Capitão ×2. Aposta no melhor marcador: +20/+10/+5.
- **Golos sofridos e baliza a zero contam o jogo inteiro**, mesmo para quem entra no fim (confirmado com dados).

### Pontuação dos treinadores (ponto 14)
**Nota dos jornalistas (14.1), como os jogadores**, mais: vitória +1, empate 0, derrota −1; recuperação de desvantagem: empate +1 por golo recuperado, se acabar em vitória os pontos duplicam; não marcar −1; não sofrer +1; ganhar por >2 +1; perder por >2 −1; +1 por golo de suplente; expulsão −3. Adjunto a substituir (castigo) ou treinador despedido → não pontua.
- A nota do treinador vai de **0 a 5 sem conversão** (o 5 não vale 7, ao contrário dos jogadores) — confirmado pelo quadro oficial "Sistema de pontuação" e pelos dados.
- Reviravolta em vitória "(…) x2" = **+1 da vitória + 2×N** (N = golos de desvantagem recuperados). Esclarecido com 12 vitórias com reviravolta (jornadas 2-9): a leitura "2×N em vez do +1" daria nota 5 em 11 dos 12 casos; esta dá 4, como as outras vitórias.
- Expulsão de treinador: só cartões vermelhos ao treinador (os amarelos a treinadores aparecem nos incidentes do Sofascore e não contam).
- "Sem marcar golos −1 (75'+)" aplica-se só a avançados (regulamento + 99% de acerto nos dados), apesar de o quadro oficial o mostrar a toda a largura.
- Calibrado com 135 casos (jornadas 2-9): retirando os eventos, a nota fica sempre entre 0 e 5. Média por resultado: **vitória 3,78 · empate 2,85 · derrota 2,29**. Totais reais vão de −2 a 10 (Farioli 10, 7, 8, 5).
- Os pontos de jogadores e treinadores são sempre **inteiros**; os valores da app são **pontos esperados** (médias ponderadas pelas probabilidades), por isso têm decimais.

## O que já aprendemos com os dados (calibração com os PDFs)

- **PDFs disponíveis: jornadas 2-9.** As jornadas 2-5 são rondas experimentais (numeradas "2.ª-5.ª RONDA", antes do fecho do mercado) e as oficiais recomeçam em "1.ª RONDA" = 6.ª jornada. O parser guarda `j` (jornada da Liga, chave única) e `r` (ronda oficial ou null). Nas experimentais há jogadores que já saíram ou mudaram de clube: a correspondência é feita por clube e a forma usa só os pontos no clube atual. Equipa com todos os jogadores a 0 numa jornada = jogo adiado (esses zeros são ignorados). Clube "Académico"/"Académico de Viseu" = "Académico Viseu".
- Regras de eventos confirmadas em **99,8% de 2115 exibições** (jornadas 2-9).
- A nota Record observada: 0 = 1%, 1 = 15%, 2 = 31%, 3 = 44%, 4 = 9%, **5★ (7 pts) = 4 casos em 2115**.
- Regressão da nota (2086 casos, R² ≈ 0,53): `1,75 + 0,99·(60'+) + 0,60·(30-59') + 0,37·(nota Sofascore − 6,8) + 0,47·golo + 0,39·assist + 0,15·vitória − 0,27·derrota + 0,29·GR`.
- **Minutos garantidos são o fator principal**; a nota Sofascore pesa pouco. Probabilidade de vitória (odds) e de golo/assistência vêm a seguir.
- Algumas posições na Liga Record diferem do Sofascore (ex.: Prestianni, Flávio Gonçalves, João Guilherme e Aranda são AV; Miguel Nogueira é MED; Víctor Gómez, Yeimar Mosquera, Tony Strata e Khaly são DEF; Zalazar é MED). A app infere-as dos PDFs; as ambíguas estão fixadas em `SEED_POS` (js/app.js).
- **Onze da semana da ronda 4: 99 pontos com um onze de 6,5 M€** (Mosquera 14, João Guilherme 9, Jakupovic 9, Margarido 8…). Os craques caros fizeram 5-7. Preço ≠ pontos: titulares baratos de equipas com jogo muito favorável rendem tanto como estrelas. O vencedor da ronda 4 (85 pts, onze de 27,2 M€) ganhou com capitão + treinador do jogo mais desequilibrado (Jakupovic ©, Margarido; Vitória 5-0).
- **Backtest rondas 1-4** (modelo reconstruído só com dados anteriores a cada jornada + odds; onze ideal sem orçamento, sem suplentes, + treinador): modelo original 177 pts (44/ronda) · "titulares de favoritos" 169 · melhor onze possível ~110/ronda. Correlação de Spearman previsto×real ≈ 0,57 (forma LR sozinha ≈ 0,57). Falhas típicas: jogadores rodados que acabam com −1 (Rui Silva, Ian Luccas na ronda 2) e equipas que rendem pouco na LR apesar do xG (Estrela/Marcus, Sporting). Com 4 rondas parecia que misturar 30% da média LR dava +12%, mas era ruído.
- **Backtest jornadas 3-9 (7 rondas, sem dados do futuro)**, pontos reais do onze ideal + treinador: original 343 (49,0/ronda) · pPlay rigoroso 349 · **rigoroso + 0,25×desvio LR da equipa 362 (51,7/ronda)** · +forma LR 15-50% 348-359 · só forma LR 304 · ótimo possível ~108/ronda. Spearman previsto×real ≈ 0,47 (a forma LR piora a ordenação). Escolhido: pPlay rigoroso (85% últimos 3 jogos, ×0,6 se falhou o último) + `TEAM_LR_WEIGHT = 0.25`, `LR_FORM_WEIGHT = 0`. Diferenças pequenas (~5%): repetir o backtest a cada PDF novo.
- Desvio LR por equipa (pontos por exibição vs média, jornadas 2-9): Benfica +1,5 · Porto +1,4 · Santa Clara +0,6 · Sporting +0,6 · Arouca +0,5 · Académico +0,4 · Braga +0,4 … Estoril −1,0 · Rio Ave −1,1 · Marítimo −1,1. (Só nas rondas oficiais o Sporting estava abaixo; com as experimentais fica acima da média.)

## Modo Champions (UEFA Champions League Fantasy)

Seletor **Liga Record | Champions** no topo da app (`localStorage lr.mode`). Regras (gaming.uefa.com/en/uclfantasy/rules, 2026/27):
- Plantel 15 (2 GR, 5 DEF, 5 MED, 3 AV), 100 M€ (105 depois da fase de liga), máx. 3 por clube (4-8 nas eliminatórias). Onze: 1 GR, ≥3 DEF, ≥2 MED, ≥1 AV. Capitão ×2.
- Pontos: jogar +1, 60' +1, golo GR/DEF +6, MED +5, AV +4, golo de fora da área +1, assistência +3, baliza a zero (60'+) GR/DEF +4, MED +1, cada 2 golos sofridos GR/DEF −1, cada 3 defesas GR +1, cada 3 bolas recuperadas +1, homem do jogo +3, penálti ganho +2 / cometido −1 / falhado −2 / defendido +5, amarelo −1, vermelho −3, autogolo −2.
- Transferências: 2 grátis por jornada na fase de liga (só 1 transita), −4 por cada extra; ilimitadas antes da fase de liga, dos play-offs e dos oitavos. Jokers: Wildcard e Limitless. Fecho = 1.º jogo da jornada; entre dias da jornada podem-se fazer até 4 substituições e mudar de capitão (para quem ainda não jogou).
- **Dados:** o marcador "Liga Record ⚽" corrido em gaming.uefa.com lê os ficheiros públicos da Fantasy (`/en/uclfantasy/services/feeds/`: `fixtures_90_en.json`, `players_90_en_<jornada>.json`, `popupstats/popupstats_90_<id>.json` por jogador) e envia para a app (mensagem `ucl-data`). No sofascore.com, o mesmo marcador junta as odds 1X2 e de mais/menos 2,5 golos da próxima jornada da Champions (`data.ucl`).
- Estados da UEFA: pStatus I lesionado, S castigado, NIS fora da convocatória, D dúvida; "Unlikely to start next game" = provável suplente.
- **Calibração (jornadas 1-3, 2175 exibições):** as regras reproduzem os pontos reais da UEFA em 96,6% dos casos. Os outros são guarda-redes: o ficheiro não traz as defesas, por isso os pontos de defesas deduzem-se do total. Esta época tem 4,09 golos por jogo (LG = 2,05 por equipa). Médias por 90' em `PRIOR` (js/ucl-model.js). Backtest J2-J3 sem odds: média prevista dos titulares ≈ real por posição; Spearman 0,53-0,62 em todos, ~0,12 só entre titulares (muita variância).

### Estado da equipa da Champions ("Man. City da Temu", 3-nov-2026, antes da jornada 4)
Raya, Lammens · Gabriel, Calafiori, Hakimi, Dimarco, N. Brown · Vitinha, Yamal, Enzo Fernández (Man City), Gravenberch, Barcola (Liverpool) · Kane, Ferran Torres (Paris), Mbeumo. Valor 98,7 M€, saldo estimado 1,3 M€. Wildcard e Limitless por usar. 2 transferências grátis.
Recomendado para a J4: Dimarco → João Cancelo (Barcelona), Mbeumo → Tresoldi (Club Brugge); capitão Yamal (joga terça; trocar para um jogador de quarta se falhar).

## Estrutura

```
index.html                     app (abrir no Chrome; dados guardados em IndexedDB/localStorage)
js/model.js                    modelo: força das equipas, probabilidades, calibração, projeção, onze, transferências
js/app.js                      interface (separadores: onze, transferências, jogos, histórico, ranking, plantel, calibração).
                               Histórico: guarda o onze de cada jornada até ao fecho (localStorage lr.history, vai no sync.json)
                               e calcula os pontos reais com o PDF (3 suplentes automáticos, capitão ×2, treinador)
                               — confirmado: bate certo com os pontos oficiais das rondas 1-4 (54, 27, 55, 65).
js/ucl-model.js                modelo da Champions: odds → golos esperados, pontos por jogador, onze, transferências, plantel de raiz
js/ucl-app.js                  interface do modo Champions (mesmos separadores; Calibração só na Liga Record)
js/ucl-history-seed.js         Champions J1-J3 (screenshots): onze no fecho, substituições, oficial 122/71/55; esperado simulado com
                               odds da véspera. Teu 248 reais (esperado 161) · onze do modelo 230 (esperado 190).
js/history-seed.js             onzes das jornadas 6-10 (screenshots) + simulação: J6-J9 com o modelo sobre dados reconstruídos
                               da véspera (rounds do Sofascore + odds/xG/ausências por jogo; validado: J10 reconstruída = ±0,1/jogador)
                               e `alt` = onze do modelo com os mesmos 15. J6-J10: teu onze 270 pts reais (esperado 261) · modelo 258.
collector/sofascore-collector.js  função ligaRecordCollector(); a app gera com ela o marcador "Liga Record ⚽" (bookmarklet).
                               No sofascore.com: envia os dados à app por postMessage (botão "Atualizar Sofascore") ou descarrega .json
js/pdf-import.js               lê os PDFs no browser (pdf.js 3.11.174 da cdnjs, worker na própria página); igual ao parser Python
pdfs/                          guardar aqui os PDFs semanais (botão "Atualizar pontuações (PDFs)" lê esta pasta)
scripts/serve.js               servidor local opcional (node scripts/serve.js . 8765)
manifest.json, sw.js, icons/   app instalável no telemóvel (Android: "Adicionar ao ecrã principal"); sw = rede primeiro, cache offline
data/sync.json                 gerado pelo botão "Publicar" (PC): dados + plantel; o site no telemóvel aplica-o ao abrir se for mais recente
publicar.bat                   git add/commit/push → GitHub Pages (o .gitignore exclui pdfs/ porque os emails têm nome e email do utilizador)
scripts/parse_pontuacoes.py    PDFs "Liga Record - Pontuações" → data/pontuacoes.json (pdfplumber)
data/pontuacoes.json           pontuações oficiais por ronda (todos os jogadores e treinadores)
```

## Fluxo semanal (o que fazer quando o utilizador pede a equipa da jornada)

1. **Pontuações**: se houver um PDF novo em `C:\Users\fcorreia\Downloads\Gmail - Liga Record - Pontuações*.pdf`, correr
   `python scripts/parse_pontuacoes.py data/pontuacoes.json <todos os PDFs>` (usar `python` sem `-I`; o Python da Microsoft Store não vê a pasta Temp).
2. **Dados Sofascore**: no browser integrado, abrir https://www.sofascore.com/ e correr o coletor (com `window.__LR_NO_DOWNLOAD = true` fica em `window.__ligaRecordData`), ou pedir ao utilizador para o correr no Chrome dele. Não chamar a API do Sofascore por curl/Python (bloqueado).
3. **Varrimento completo antes de recomendar** (pedido explícito do utilizador): todas as equipas, todos os jogadores, últimos 3-5 jogos (minutos, nota, golos, assistências), xG/xGA, odds, lesionados/castigados (Sofascore `missingPlayers` + notícias Record/A Bola/O Jogo).
4. **Recomendar**: 1 transferência (dentro do saldo), onze e tática, capitão, 4 suplentes por ordem, treinador. Indicar sempre a hora de fecho.
5. **Recalibrar** a nota Record com cada PDF novo e atualizar esta secção se os coeficientes mudarem muito.

## Preferências do utilizador

- Prefere **3 defesas** (3-4-3 / 3-5-2) porque os defesas perdem pontos com golos sofridos; usar 4 só quando os defesas têm jogos muito favoráveis.
- Quer análise completa com dados (Flashscore, Sofascore, notícias), apresentada em tabelas, e a recomendação no fim.
- Envia screenshots do plantel (com V.A./V.I.) e os PDFs semanais das pontuações.

## Estado do plantel ("MAN. CITY DA TEMU", 30-out-2026, jornada 10)

GR: Diogo Costa, Lucão, Lucas França · DEF: Bednarek, Buatu, Van Breemen, F. Moura, Javi Sánchez, Fontán, Lagerbielke, Paulo Henrique · MED: Altimira, Fukui, Gabri Veiga, Gil Martins, Miguel Nogueira, Guzzo, Samu (Vitória), Kahraman · AV: Barbero, Flávio Gonçalves, Paciência, Pavlidis. Saldo 2,5 M€.
Plano: próxima jornada vender **Paciência** (1,0 M€, lesionado) → comprar **Prestianni** (AV, ~3,3 M€). Depois: Moura → Kiwior; vender Paulo Henrique. Confirmar sempre preços e saldo no screenshot mais recente.
