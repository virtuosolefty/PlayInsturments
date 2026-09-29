import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Entry from './Entry.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

/**
 * The typefaces, self-hosted.
 *
 * The design system named Inter from the start but nothing ever loaded it, so
 * every weight, size and letterspacing in the app was being tuned against
 * whatever the operating system happened to substitute — Segoe UI on Windows,
 * SF on a Mac. The variable weight axis is the whole file rather than one
 * static cut per weight, and each subset carries a `unicode-range`, so an
 * English session downloads the latin subset alone.
 */
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';

import './styles.css';
import './studio.css';
import './desktop.css';
import './instruments.css';
import './polish.css';
import './guitar.css';
import './practice-ux.css';
import './learning.css';
import './discovery.css';
import './strings.css';

document.getElementById('public-intro')?.remove();
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Entry />
    </ErrorBoundary>
  </StrictMode>,
);
