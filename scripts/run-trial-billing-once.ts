import 'dotenv/config';

import { runTrialExpirationBillingNow } from '../server/jobs/cleanup';
import { logger } from '../server/lib/logger';
import { loadEnv } from '../shared/env';

async function main() {
  try {
    loadEnv(process.env);

    logger.info('Starting one-off trial/renewal billing sweep...');
    await runTrialExpirationBillingNow();
    logger.info('Trial billing sweep complete.');
  } catch (error) {
    logger.error('Trial billing sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
