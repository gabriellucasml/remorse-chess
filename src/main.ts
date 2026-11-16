import { startApp } from './ui/app';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) throw new Error('Elemento #app ausente.');

// Troque `null` por um Agent (src/agents/agent.ts) para sentar uma máquina
// nas brancas (`w`) ou nas pretas (`b`).
startApp(root, {
  agents: {
    w: null,
    b: null,
  },
});
