import { startApp } from './ui/app';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) throw new Error('Elemento #app ausente.');

startApp(root);
