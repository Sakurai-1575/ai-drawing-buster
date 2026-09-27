import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadLanguage } from './i18n/loadLanguage';
import { readLang } from './hooks/useLang';
import './index.css';

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Only the starting language is fetched up front; the others load on demand.
loadLanguage(readLang()).then(render, render);
