import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Proveedores } from './app/Proveedores';
import { rutas } from './app/rutas';
import { registroServiceWorker } from './registrar-sw';
import './styles.css';

const router = createBrowserRouter(rutas);

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root');

createRoot(raiz).render(
  <StrictMode>
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>
  </StrictMode>,
);

// Shell disponible sin conexión tras la primera carga online (T026A). Solo en producción.
void registroServiceWorker.registrar();
