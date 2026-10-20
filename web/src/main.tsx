import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DialogHost } from './Dialog';
import './style.css';

registerSW({ immediate: true });
navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(<StrictMode><App /><DialogHost /></StrictMode>);
