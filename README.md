# Liga Record – Previsões

App local (HTML) para prever os pontos da Liga Record por jornada e escolher o onze, o capitão, os suplentes, o treinador e a transferência da semana.

## Uso semanal

1. **Dados do Sofascore**: abre https://www.sofascore.com/ no Chrome → F12 → Consola → cola o conteúdo de `collector/sofascore-collector.js` → Enter. Ao fim de 2-4 minutos é descarregado `sofascore-AAAA-MM-DD.json`.
2. **Pontuações da Liga Record** (opcional, mas melhora o modelo): guarda o email semanal em PDF e corre
   ```
   python scripts/parse_pontuacoes.py data/pontuacoes.json "C:\Users\fcorreia\Downloads\Gmail - Liga Record - Pontuações6.pdf" ...
   ```
   (todos os PDFs da época de uma vez). Requer `pip install pdfplumber`.
3. Abre `index.html` no Chrome e carrega os dois ficheiros no topo.
4. **Plantel**: confirma os 23 jogadores, a posição Liga Record, os preços (V.A.) e o saldo. Usa "Disponibilidade" para dúvidas/lesões que o Sofascore ainda não mostre.
5. Consulta **O meu onze**, **Transferências**, **Ranking da liga**, **Jogos da jornada** e **Calibração**.

Os dados ficam guardados no browser; o plantel pode ser exportado/importado em JSON.

## Modelo

Ver `CLAUDE.md` (regras, calibração e fluxo semanal) e `js/model.js`.
