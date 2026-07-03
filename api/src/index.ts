import 'dotenv/config';
import { buildServer } from './server';

const PORT = Number(process.env.PORT ?? 8787);

buildServer()
  .then(async (app) => {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    // Tracking auto-rotation: refresh stale live shipments, auto-complete finished
    // ones (frees their slot), and pull queued shipments into free slots — so the
    // 10 Terminal49 slots stay busy without anyone clicking Refresh. Also the
    // polling fallback when no Terminal49 webhook is registered.
    const mins = Number(process.env.TRACKING_SWEEP_MINUTES || 30);
    if (mins > 0) {
      const run = async () => {
        try {
          const { sweep } = await import('./services/trackingRepo');
          const r = await sweep();
          if (r.refreshed || r.started) app.log.info(r, 'tracking sweep');
        } catch {
          /* no DB / no key — next tick retries */
        }
      };
      setInterval(run, mins * 60_000);
      setTimeout(run, 15_000); // first pass shortly after boot
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
