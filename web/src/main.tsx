import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DialogHost } from './Dialog';
import './style.css';

registerSW({ immediate: true });
navigator.storage?.persist?.();
// After a reload an overlay flag has no history entry under it, so closeOverlay()'s Back would leave the app.
const stripped = location.hash.replace(/[?&](scan|till)=1/g, '');
if (stripped !== location.hash) history.replaceState(null, '', stripped || '#/cards');

createRoot(document.getElementById('root')!).render(<StrictMode><App /><DialogHost /></StrictMode>);
