import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateEmbedding } from './embeddings.js';
import { initializeDatabase, searchActions, closePool } from './db.js';

dotenv.config();
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

let dbInitialized = false;

// Initialize DB once
async function ensureDB() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
    console.log('Database initialized');
  }
}

// POST /api/search
app.post('/api/search', async (req, res) => {
  try {
    await ensureDB();

    const { query } = req.body;
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'No query provided' });
    }

    // Generate embedding for search query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar actions
    const results = await searchActions(queryEmbedding, 10); // top 10

    // Return to frontend
    res.json({
      results: results.map(r => ({
        name: r.name,
        similarity: r.similarity
      }))
    });
  } catch (err) {
    console.error('Search failed:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await closePool();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
