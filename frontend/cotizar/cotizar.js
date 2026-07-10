import { api } from '../shared/api.js';

// TODO Fase 2: cargar ramos activos y armar el flujo de cotización.
async function init() {
  const ramos = await api.get('/ramos');
  console.log('Ramos activos:', ramos);
}

init();
