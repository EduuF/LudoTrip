# Estudo: diversão não invasiva

O Dia/Noite v2 virou a régua: é engraçado, tem antecipação, ação e reação, e nunca atrapalha. Este estudo
propõe **onde mais** cabem momentos assim e **como** seriam, sempre com o mesmo elenco 24 × 30
(`src/ui/stage/cast.ts`) e o mesmo contrato.

Versão para ler no celular: https://claude.ai/artifact/RCPdMFSo17prmvTDpyQG7P

## 1. O contrato (vale para toda animação)

1. **A ação acontece na hora; a animação é a reação.** O dado muda imediatamente. Nada espera a animação acabar.
2. **Nunca recebe toque nem cobre o que a pessoa está usando.** A camada tem `pointer-events: none` e fica fora dos campos e do painel aberto.
3. **Curta por padrão.**
   - Micro: até 0,8 s.
   - Momento: até 1,5 s.
   - Longa (até ~4 s): só quando a própria pessoa pediu e é raro, como o Dia/Noite.
4. **Variações que dão vontade de descobrir.**
   - Todo momento tem **pelo menos 3 variações** ligadas ao contexto: modo da viagem, tipo da atividade, dia ou noite, destino.
   - Há também **1 variação rara** (cerca de 1 em 12) para quem repete.
   - As variações são sorteadas, sem repetir a mesma duas vezes seguidas.
   - Todas são completas, com antecipação, ação e reação (12 princípios, skill `web-motion-design`).
5. **Não cansa.**
   - A 1ª vez é completa.
   - O mesmo gesto 3 vezes em 1 minuto vira a versão mínima (só o selo ou o brilho, sem personagem).
6. **Nunca no meio de um gesto** (arrastando, digitando) **nem junto de um erro.** Ali a pessoa precisa de clareza, não de graça.
7. **O mesmo elenco e o mesmo traço.**
   - Os viajantes da viagem são os protagonistas: quem aparece é um deles.
   - Os objetos vêm do mundo da viagem: bilhete, mala, futon, lanterna, origami, pombo-correio.
8. **Respeita o corpo e o ambiente.**
   - Com "reduzir movimento", nada se mexe; o estado final aparece direto.
   - Som só com os sons ligados.
   - No menu ⋯, o interruptor **"Animações: completas / discretas"** (discretas = só a versão mínima).

## 2. Os momentos

Prioridade: ★★★ = alto valor e baixo risco; ★★ = bom, mas depois; ★ = opcional.

### 1. Viagem criada ★★★ (2 s, um toque pula)

Gatilho: "VIAGEM CRIADA!". Os viajantes entram no veículo do 1º trecho e partem pela trilha até o 1º destino, que acende.

- **Carro/Kombi:** a porta abre, eles entram em fila, a Kombi dá um tranco e sai soltando fumacinha.
- **Avião:** sobem a escada, o avião taxia e decola deixando um risco na trilha.
- **Trem:** apito, as portas fecham com "plim", o trem desliza sobre trilhos pixel.
- **Barco:** eles acenam do convés, a buzina solta um anel de vapor.
- **Rara:** o veículo parte sem eles; eles correm atrás, pulam para dentro e alguém perde o chapéu.

### 2. Passagem comprada ★★★ (0,9 s)

Gatilho: marcar a passagem de um trecho como comprada. O carimbo 済 de hoje continua.

- **Bilheteiro:** um bonequinho de quepe picota o bilhete ("clic") e sai confete de papel.
- **Bilhete para a mala:** o bilhete dobra e voa para dentro de uma mala que fecha.
- **Carimbo próprio:** o viajante bate o carimbo com as duas mãos e o bilhete pula.
- **Rara:** o bilhete escapa com o vento e o viajante corre atrás dele pela tela.

### 3. Hospedagem reservada ★★★ (1 s)

Gatilho: marcar a hospedagem da cidade como reservada. Acontece no pino da cidade.

- **Futon (Japão e afins):** um futon desenrola, ele deita, sai um "zzz", o futon dobra e some.
- **Cama de hotel:** ele pula na cama, que quica.
- **Barraca (camping/trilha):** a barraca arma sozinha e ele espia pela porta.
- **Rara:** o travesseiro cai na cabeça dele e voam penas.

### 4. Atividade feita ★★★ (0,8 s)

Gatilho: marcar a atividade como feita. Uma polaroid pequena cai girando sobre o cartão do dia.

- **Foto (padrão):** o viajante tira uma foto com flash.
- **Selfie em grupo:** todos se espremem no quadro.
- **Comer (restaurante/comida):** ele dá uma mordida e sai um coração.
- **Pular (imperdível):** pulo com os braços para cima.
- **Rara:** um gato aparece na polaroid.

### 5. Guardada na nuvem ★★★ (1,2 s)

Gatilho: "☁️ Salvar" deu certo, a 1ª vez de cada viagem. Substitui a animação de subida atual.

- **Arremesso:** o viajante joga o cartão da viagem para cima e uma nuvenzinha o "engole"; vira ☁️ Salvo ✓.
- **Balão:** o cartão sobe preso num balão.
- **Pipa:** o cartão vira pipa e sobe.
- **Rara:** a nuvem espirra e devolve o cartão uma vez antes de guardar.

### 6. Internet voltou com alterações na fila ★★ (1 s)

Gatilho: alterações guardadas sem internet foram enviadas.

- **Pombo-correio:** um pombo cruza o topo levando cartinhas; o "Enviando 3…" desce até ✓ conforme ele passa.
- **Carteiro de bicicleta:** atravessa o topo e joga as cartas.
- **Avião de papel:** as cartinhas voam uma a uma.
- **Rara:** o pombo derruba uma carta, volta e pega.

### 7. Desfazer ★★ (0,5 s)

- **Ré:** o ↶ gira para trás e os viajantes do mapa dão dois passinhos de ré, como uma fita rebobinando.
- **Fita:** risquinhos de VHS passam rápido.
- **Borracha:** uma borracha apaga um rastro.
- **Rara:** eles fazem o "moonwalk".

### 8. Apagar uma viagem (com Desfazer) ★★ (0,8 s)

- **Tsuru:** o cartão dobra em um tsuru de origami e voa para fora. O Desfazer o traz de volta voando e desdobra.
- **Barquinho:** o cartão vira barquinho de papel e sai flutuando.
- **Avião de papel:** o cartão vira avião e plana para fora.
- **Rara:** o tsuru dá uma volta e pousa na cabeça de um viajante antes de sumir.

### 9. Subiu de nível ★★ (1,5 s)

Gatilho: novo nível. Complementa as pétalas de hoje.

- **Hanabi (noite):** fogos pixel atrás do selo de nível; os viajantes olham para cima.
- **Confete (dia):** confete e eles comemoram.
- **Taiko:** um tambor bate três vezes e o selo pula a cada batida.
- **Rara:** o fogo sai em forma de ♥ ou do 1º kanji do destino.

### 10. O grande dia ★★★ (2,5 s, uma vez só)

Gatilho: abrir o app no dia da ida.

- **Malas:** uma tempestade de pétalas; os viajantes, de mala na mão, acenam: "Hoje é o dia!".
- **Portão de embarque:** se o 1º trecho é voo, eles passam pelo portão.
- **Estrada:** se é carro, eles fecham o porta-malas.
- **Rara:** alguém volta correndo porque esqueceu a mala.

### 11. Viajantes ociosos ★★ (ambiente)

Gatilho: 20 s sem tocar no mapa. Para no primeiro toque; uma vez por visita ao mapa.

- **Sentado na mala.**
- **Apontando o próximo destino.**
- **Bocejo.**
- **Tirando foto da paisagem.**
- **Rara:** um tanuki passa correndo ao fundo.

### 12. Tocar nos viajantes (easter egg) ★★ (0,6 s)

- **Pulo e aceno.**
- **Joinha.**
- **Ficam vermelhos de vergonha.**
- **Rara (5 toques seguidos):** um deles dança.

### 13. Tarefa concluída ★ (0,6 s)

- **Carimbo:** o ✓ ganha um carimbo.
- **Joinha:** o viajante faz joinha ao lado.
- **Risco a pincel:** a tarefa é riscada com um traço de pincel.
- **Rara:** o carimbo sai torto e ele conserta.

### 14. Alguém entrou na viagem ★★★ (M5, 1,5 s)

Gatilho: convite aceito.

- **Correndo:** um viajante novo chega correndo pela trilha, para no grupo e acena; o nome aparece num balão.
- **De bicicleta.**
- **De paraquedas.**
- **Rara:** ele chega com um presente e todos comemoram.

### 15. "Suas viagens" vazia ★★ (ambiente)

Gatilho: primeira visita.

- **Mapa dobrado:** um viajante sentado numa mala olha um mapa dobrado, que se abre quando a pessoa toca em "Criar viagem".
- **Bússola:** ele gira uma bússola.
- **Globo:** ele gira um globo.
- **Rara:** o mapa voa da mão dele e cai aberto.

## 3. O que não faria

- **Animação em erro ou recusa:** ali a pessoa precisa de clareza.
- **Animação ao abrir painéis comuns:** é o caminho de todo dia.
- **Animação a cada mudança de dia:** o "Ver a viagem" já cobre.
- **Qualquer coisa que dispute atenção** com o que a pessoa está editando.

## 4. Base técnica: o "Palco" (`src/ui/stage/`)

- **Elenco:** `cast.ts` (pronto). São os 4 viajantes e as 14 poses; poses novas saem das mesmas peças.
- **`play(timeline)` pelo relógio:**
  - sempre termina e limpa a tela;
  - devolve "encerrar agora";
  - é o mesmo esquema do Dia/Noite, que passa a usá-lo.
- **Camada sem toque:** fixa e acima do conteúdo, nunca acima de painéis abertos.
- **Sorteio sem repetição e raridade:** `pick(moment, context)` escolhe a variação. Não repete a última e dá cerca de 1 chance em 12 para a rara.
- **Teto de frequência:** da 3ª repetição em 1 minuto em diante, a versão mínima.
- **Respeito:** a tudo que a pessoa escolheu:
  - "reduzir movimento";
  - o interruptor "Animações";
  - os sons.
- **Testes com relógio falso** para cada momento:
  - o dado muda antes da animação;
  - nada sobra na tela;
  - a variação mínima aparece depois de 3 repetições;
  - com "reduzir movimento", nada se mexe.

## 5. Ideia para depois

**Álbum "Animações descobertas"** em Tarefas ou Nível. Cada variação vista vira uma figurinha, e as raras, figurinhas brilhantes. Transforma a descoberta em coleção.

## 6. Sugestão de primeira leva

O Palco e o interruptor "Animações", mais os momentos:

1. Viagem criada.
2. Passagem comprada.
3. Hospedagem reservada.
4. Atividade feita.
5. Guardada na nuvem.
6. O grande dia (momento 10).

Todos são ★★★: acontecem em gestos que a pessoa faz de propósito e poucas vezes, onde uma comemoração cabe.
