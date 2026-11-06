import { cargarConfig } from './config.js';
import { crearPool } from './db.js';
import { crearApp } from './app.js';
import { crearMarce } from './marce.js';

const config = cargarConfig();
const pool = crearPool(config.databaseUrl);
const marce = crearMarce({ modelo: config.anthropicModelo, activo: config.marceActivo });
const app = crearApp({ config, pool, marce, logger: { level: config.produccion ? 'info' : 'debug' } });

app.listen({ port: config.puerto, host: '0.0.0.0' })
  .then(() => app.log.info(`API lista en el puerto ${config.puerto}. Marce ${marce.activo ? 'activa' : 'sin llave de IA'}.`))
  .catch((e) => { console.error(e); process.exit(1); });

for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { await app.close(); await pool.end(); process.exit(0); });
