import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize the database with pgvector extension and actions table
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create actions table with vector column
    // bge-large-en-v1.5 produces 1024-dimensional vectors
    await client.query(`
      CREATE TABLE IF NOT EXISTS actions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        embedding vector(1024),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create an index for faster similarity search
    await client.query(`
      CREATE INDEX IF NOT EXISTS actions_embedding_idx
      ON actions
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 10)
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

// Insert an action with its embedding
export async function insertAction(name, embedding) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO actions (name, embedding)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET embedding = $2`,
      [name, `[${embedding.join(',')}]`]
    );
  } finally {
    client.release();
  }
}

// Insert multiple actions with embeddings
export async function insertActions(actionsWithEmbeddings) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { name, embedding } of actionsWithEmbeddings) {
      await client.query(
        `INSERT INTO actions (name, embedding)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET embedding = $2`,
        [name, `[${embedding.join(',')}]`]
      );
    }

    await client.query('COMMIT');
    console.log(`Inserted ${actionsWithEmbeddings.length} actions`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Search for similar actions using cosine similarity
export async function searchActions(queryEmbedding, limit = 5) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        name,
        1 - (embedding <=> $1) as similarity
       FROM actions
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [`[${queryEmbedding.join(',')}]`, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Get all actions
export async function getAllActions() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT id, name, created_at FROM actions ORDER BY id');
    return result.rows;
  } finally {
    client.release();
  }
}

// Clear all actions
export async function clearActions() {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE actions RESTART IDENTITY');
    console.log('All actions cleared');
  } finally {
    client.release();
  }
}

// Close the connection pool
export async function closePool() {
  await pool.end();
}

export default {
  initializeDatabase,
  insertAction,
  insertActions,
  searchActions,
  getAllActions,
  clearActions,
  closePool
};