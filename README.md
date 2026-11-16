# Remorse Chess

Xadrez em que matar deixa marca.

As peças andam como sempre andaram. O rei continua sagrado, o peão ainda sonha com a última fileira, e um mate ainda acaba o dia. A diferença é o que acontece depois do golpe: quem captura fica **culpado**. Uma peça culpada segue livre para caminhar, mas perdeu o direito de tirar outra vida.

É uma partida para duas pessoas no mesmo tabuleiro. Não há máquina jogando — o lugar dela está reservado, se um dia você quiser sentar uma.

## Abrir o jogo

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). As brancas começam embaixo. Clique numa peça sua e depois na casa de destino.

No painel dá para desfazer o último lance, girar o tabuleiro, desistir ou começar de novo. `Esc` solta a peça selecionada.

## A culpa

Capturar mancha a peça na hora. O selo vermelho no canto da casa é a culpa, e ela já vale na posição que ficou:

- a peça anda normalmente por casas vazias;
- não captura ninguém, nem um rei, nem outra peça culpada;
- não dá xeque e não protege casa nenhuma.

Por isso um golpe não ameaça o rei por si só. `Dxf7` tira o peão e deixa a dama culpada: ela está ao lado do rei e, mesmo assim, não é xeque. Um xeque descoberto continua valendo, porque quem ameaça é a peça que ficou limpa atrás.

Quem não está culpado captura uma peça culpada do mesmo jeito que capturaria qualquer outra. A culpa não é armadura.

## A absolvição

Só o bispo lava a culpa dos outros.

Termine o lance dele numa das oito casas ao redor da peça culpada. O jogo pergunta se você quer absolver. Pode absolver uma, várias, ou nenhuma: o rito é uma escolha, e o preço é a **penitência**. O bispo e cada peça absolvida não se movem no seu próximo lance. O adversário, no meio do caminho, ainda pode capturá-las. Penitência não apaga ataque: uma peça limpa em penitência continua dando xeque, só não sai do lugar quando chega a vez dela.

Um bispo culpado também absolve. A culpa dele mesmo não sai por esse rito.

## O repouso do bispo

O bispo tem um perdão que nenhuma outra peça tem. Se você gastar o lance movendo outra coisa, todo bispo culpado que ficou parado depõe a culpa sozinho, sem penitência. No lance em que ele próprio capturou, a mancha fica: foi ele quem se mexeu.

Por isso o bispo não aparece na lista de absolvição. O repouso já o limpa, e de graça.

## A promoção

O peão não vira dama. Na última fileira ele vira **bispo**.

Se os dois bispos caírem, promover é o único caminho de volta à absolvição. O peão promovido não absolve no lance em que chega; a partir do seguinte, já é bispo de verdade.

Um peão culpado ainda anda, desde que a casa da frente esteja livre. Se ele chega ao fim, vira bispo. Se herdou a mancha da captura, o lance seguinte de outra peça o limpa pelo repouso. Quem promove nessa hora fica com o único bispo do tabuleiro, e só ele volta a absolver.

## Quando a culpa não sai

Sem bispo, a culpa só sai se um peão virar um. Se não há peão, ou se todo peão está preso numa coluna que ninguém consegue desocupar sem capturar, a mancha é para sempre. Peça culpada não ataca. Quando os dois lados estão assim, não existe sequência de lances que dê mate, e a partida empata na hora.

Um peão com o caminho livre, ou com alguém na frente que pode sair da coluna, mantém o jogo vivo.

## O que não mudou

Roque, en passant, cravada e xeque seguem as regras de sempre. Um peão culpado não toma en passant: tomar é capturar, e capturar ele não pode mais.

A notação do painel é a brasileira: `R` rei, `D` dama, `T` torre, `B` bispo, `C` cavalo. Um `*` no lance marca que houve absolvição.

A partida acaba por xeque-mate, afogamento, cinquenta lances sem captura nem peão, a mesma posição três vezes, mate impossível ou desistência.

## Um agente, quando quiser

O motor em `src/engine` não desenha nada. `legalMoves` devolve cada lance legal, inclusive cada combinação de absolvição, e `play` devolve um estado novo sem mexer no antigo.

A cadeira da máquina está em `src/agents/agent.ts`. Para sentar alguém, troque o `null` em `src/main.ts`:

```typescript
startApp(root, {
  agents: { w: null, b: meuAgente },
});
```

`w` são as brancas, `b` as pretas. `null` deixa o lugar para a pessoa. Enquanto o agente escolhe, o tabuleiro não aceita clique.
