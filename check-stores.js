import { db } from './server/db.js';
import { stores } from './shared/schema.js';

async function checkStores() {
  try {
    console.log('🏪 Checking stores in database...');
    const allStores = await db.select().from(stores);
    console.log('Stores found:', allStores.length);
    allStores.forEach(store => {
      console.log(`- ${store.name} (ID: ${store.id})`);
    });
  } catch (error) {
    console.error('Error checking stores:', error);
  }
}

checkStores(); 