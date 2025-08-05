import { db } from './server/db.js';
import { users } from './shared/schema.js';

async function checkUsers() {
  try {
    console.log('Checking users in database...');
    const allUsers = await db.select().from(users);
    console.log('Users found:', allUsers.length);
    allUsers.forEach(user => {
      console.log(`- ${user.username} (${user.role}) - ${user.firstName} ${user.lastName}`);
    });
  } catch (error) {
    console.error('Error checking users:', error);
  }
}

checkUsers(); 