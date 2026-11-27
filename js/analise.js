/* Gerado pela análise da IA em cada jornada (ver CLAUDE.md, "Análise da jornada"). round = jornada da Liga (lr) ou da Champions (ucl). */
window.ANALISE = {
  lr: {
    round: 12, label: '12 (ronda 7)', created: '2026-11-27T10:45:00Z',
    summary: 'Fecha hoje às 20:00 (Marítimo–Nacional às 20:15). As notícias não mudam o teu onze: Arouca, Gil Vicente, Benfica e Vitória não têm baixas conhecidas nos teus jogadores, e o Porto só tem Smalling, Gabriel Mec e Vasco Sousa no boletim clínico. O Benfica recebe o Famalicão (odd 1,15) e é o melhor jogo da jornada: Pavlidis capitão e Benfica treinador. A única correção é Lucas França, que volta à baliza do Santa Clara, mas continua atrás de Lucão.',
    recommendation: [
      'Transferência: Flávio Gonçalves (0,65 M€) → André Clóvis (Académico, 0,85 M€; saldo fica 0,2 M€). Não muda o onze desta jornada, mas o 4.º avançado passa de 2,7 para 4,1 pts esperados e joga sempre 90 minutos. Francisco Moura continua sem jogar (0 minutos nos últimos 3 jogos); se encontrares um defesa titular até 1,7 M€ (Lebedenko, Ricardo Esgaio ou David Moreira), essa troca também serve.',
      'Onze 3-4-3 (a tua preferência): Lucão · Fontán, Javi Sánchez, Bednarek · Gabri Veiga, Samu, Fukui, Kahraman · Pavlidis ©, Prestianni, Barbero — 60,0 pts esperados com o treinador. O 4-3-3 com Buatu em vez de Kahraman dá 60,1, praticamente igual.',
      'Banco, por esta ordem: Buatu, Guzzo, André Clóvis (ou Flávio Gonçalves), Lagerbielke.',
      'Capitão: Pavlidis (6,5 pts esperados, 67% de probabilidade de marcar). Treinador: Benfica (5,4); Braga em Casa Pia é a alternativa (4,9).'
    ],
    risks: [
      'Arouca: tens 4 no onze (Fontán, Javi Sánchez, Fukui, Barbero), contra o Rio Ave no sábado às 15:30. É favorito (odd 1,61), mas um mau resultado pesa muito.',
      'Porto–Sporting no domingo: o Sporting chega com o plantel todo, e Diogo Costa e Bednarek têm só 40% de probabilidade de baliza a zero. Por isso Lucão (Gil Vicente–Estoril, 58%) é o guarda-redes.',
      'Benfica (Pavlidis, Prestianni e treinador) só joga na segunda às 20:15: se algum não for titular, o banco já está fechado. Não há notícia de lesão ou poupança; os onzes saem só no domingo.',
      'Guzzo e Paulo Henrique jogam hoje à noite: Paulo Henrique recuperou de lesão e deve voltar a titular (não está no teu onze).',
      'Sem notícias datadas desta semana sobre Samu, Kahraman, Lagerbielke, Van Breemen e Gil Martins: ficam com o valor do modelo.'
    ],
    adjust: [
      { id: 832672, name: 'Lucas França', team: 'Santa Clara', pPlay: 0.9, reason: 'Recuperado da lesão muscular, volta a titular na visita ao Moreirense (substitui Neneca). Notícia de 17 nov, antes da pausa: pode haver mudanças.', source: 'Record, 17 nov', url: 'https://www.record.pt/futebol/futebol-nacional/liga-betclic/santa-clara/detalhe/lucas-franca-regressa-a-baliza-do-santa-clara-na-visita-ao-moreirense' }
    ],
    sources: [
      { source: 'FC Porto com três no boletim clínico antes do clássico (Record, 26 nov)', url: 'https://www.record.pt/futebol/futebol-nacional/liga-betclic/fc-porto/amp/fc-porto-com-tres-nomes-no-boletim-clinico-antes-do-classico-com-o-sporting' },
      { source: 'Sporting prepara o clássico sem baixas (A Bola, 26 nov)', url: 'https://www.abola.pt/noticias/ja-nao-acontecia-ha-dois-anos-sporting-comeca-a-preparar-classico-na-maxima-forca-2026112613530594019' },
      { source: 'Marítimo motivado para o dérbi com o Nacional (DNotícias, 26 nov)', url: 'https://www.dnoticias.pt/2026/11/26/514405-treinador-do-maritimo-sente-equipa-motivada-para-enfrentar-nacional/' },
      { source: 'Marítimo x Nacional: ausências e onzes prováveis (Sapo)', url: 'https://sapo.pt/artigo/maritimo-x-nacional-antevisao-ausencias-e-onzes-provaveis-6b08c1117a9ccdad1e16624e' },
      { source: 'Arouca x Rio Ave: antevisão (WhoScored)', url: 'https://www.whoscored.com/matches/1997652/preview/portugal-liga-portugal-2026-2027-arouca-rio-ave' },
      { source: 'Académico x Alverca: Bruno Pinheiro na antevisão (Flashscore)', url: 'https://flashscore.pt/noticias/futebol-liga-portugal-betclic-bruno-pinheiro-academico-espera-jogo-interessante-na-rececao-ao-alverca/hz75Ij9M' }
    ]
  },
  ucl: null
};
