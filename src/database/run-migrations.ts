import dataSource from './data-source';

dataSource.initialize()
  .then((ds) => ds.runMigrations())
  .then((m) => { console.log(`Applied ${m.length} migration(s)`); return dataSource.destroy(); })
  .catch((e) => { console.error(e); process.exit(1); });
