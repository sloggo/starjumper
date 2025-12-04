import { pipeline } from '@xenova/transformers';

// Use a singleton pattern to avoid reloading the model
let embeddingPipeline = null;

// BGE models require a specific prompt for queries vs documents
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    // Using BGE-large - largest and most accurate, 1024 dimensions
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/bge-large-en-v1.5');
  }
  return embeddingPipeline;
}

// Generate embedding for a search query (adds query prefix for BGE)
export async function generateEmbedding(text, isQuery = true) {
  const extractor = await getEmbeddingPipeline();
  const input = isQuery ? QUERY_PREFIX + text : text;
  const output = await extractor(input, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Generate embeddings for documents (no prefix - these are the items being searched)
export async function generateEmbeddings(texts) {
  const extractor = await getEmbeddingPipeline();
  const embeddings = [];

  for (const text of texts) {
    // No prefix for documents - they are the targets, not the queries
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  return embeddings;
}

// Get the embedding dimension (1024 for bge-large-en-v1.5)
export const EMBEDDING_DIMENSION = 1024;

export default { generateEmbedding, generateEmbeddings, EMBEDDING_DIMENSION };