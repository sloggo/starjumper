import { generateEmbedding } from './embeddings.js';
import { searchActions, closePool } from './db.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function getScoreColor(similarity) {
  if (similarity >= 80) return colors.green;
  if (similarity >= 60) return colors.yellow;
  return colors.gray;
}

async function search(query) {
  if (!query) {
    console.log('Usage: node src/search.js "your search query"');
    process.exit(1);
  }

  console.log(`\n${colors.cyan}Searching:${colors.reset} "${query}"\n`);

  try {
    const queryEmbedding = await generateEmbedding(query);
    const results = await searchActions(queryEmbedding, 5);

    console.log(`${colors.bright}Results${colors.reset}`);
    console.log(`${colors.gray}────────────────────────────${colors.reset}\n`);

    results.forEach((result, index) => {
      const similarity = (result.similarity * 100).toFixed(1);
      const scoreColor = getScoreColor(result.similarity * 100);
      console.log(`${colors.bright}${index + 1}.${colors.reset} ${result.name}  ${scoreColor}${similarity}%${colors.reset}`);
    });

    console.log();
  } catch (error) {
    console.error('Search failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Get query from command line arguments
const query = process.argv.slice(2).join(' ');
search(query);