import '../loadEnv';
import { backfillPendingApiKeys } from '../services/apiKeys';

backfillPendingApiKeys()
  .then((result) => {
    console.log(`API key backfill: ${result.created} pending key(s) added across ${result.companies} companies.`);
  })
  .catch((error) => {
    console.error('API key backfill failed');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
