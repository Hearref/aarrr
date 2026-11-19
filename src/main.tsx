import { createRoot } from 'react-dom/client';
import 'dockview/dist/styles/dockview.css';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
