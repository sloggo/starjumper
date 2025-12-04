import { initializeDatabase, insertAction, closePool } from './db.js';
import actions from './data/actions.js';
import { generateEmbedding } from './embeddings.js'; 

async function seed() {
  try {
    await initializeDatabase();

    console.log(`Seeding ${actions.length} actions into the database...`);

    for (const actionName of actions) {
      const embedding = await generateEmbedding(actionName);
      await insertAction(actionName, embedding);
    }

    console.log('Database seeded successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await closePool();
  }
}

seed();
