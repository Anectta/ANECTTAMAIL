import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { QuickComposeView } from './components/QuickComposeView';
import { NotificationPopupView } from './components/NotificationPopupView';
import { SplashScreenView } from './components/SplashScreenView';
import { themeService } from './services/themeService';
import './index.css';

// Inicializa a skin/tema salvo
themeService.init();

console.log('Anectta MAIL: React mounting to DOM...');
const rootElement = document.getElementById('root');

const isSplash = window.location.hash === '#splash';
const isQuickCompose = window.location.hash === '#quick-compose';
const isNotifier = window.location.hash === '#notifier';

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {isSplash ? (
        <SplashScreenView />
      ) : isNotifier ? (
        <NotificationPopupView />
      ) : isQuickCompose ? (
        <QuickComposeView />
      ) : (
        <App />
      )}
    </React.StrictMode>
  );
  console.log('Anectta MAIL: React successfully rendered!');
} else {
  console.error('Anectta MAIL: Root element not found!');
}
