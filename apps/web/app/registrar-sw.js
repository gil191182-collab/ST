'use client';
// Registra el service worker para que la app se pueda instalar en el celular.
import { useEffect } from 'react';

export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
  }, []);
  return null;
}
