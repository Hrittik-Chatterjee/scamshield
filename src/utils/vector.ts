// src/utils/vector.ts

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: any;
}

// Generate 384-dimension vector using @cf/baai/bge-small-en-v1.5
export async function generateEmbedding(text: string, aiBinding: any): Promise<number[]> {
  if (!aiBinding) {
    console.warn('[Vector] AI binding is missing. Cannot generate embedding.');
    return [];
  }
  try {
    const res = await aiBinding.run('@cf/baai/bge-small-en-v1.5', {
      text: [text]
    });
    if (res && res.data && res.data[0]) {
      return res.data[0];
    }
  } catch (err) {
    console.error('[Vector] Embedding generation failed:', err);
  }
  return [];
}

// Upsert a vector embedding into Cloudflare Vectorize
export async function upsertVector(
  vectorizeBinding: any,
  id: string,
  values: number[],
  metadata: any = {}
): Promise<boolean> {
  if (!vectorizeBinding) {
    console.warn('[Vector] Vectorize binding is missing. Cannot upsert vector.');
    return false;
  }
  try {
    await vectorizeBinding.upsert([
      {
        id,
        values,
        metadata
      }
    ]);
    return true;
  } catch (err) {
    console.error('[Vector] Vectorize upsert failed:', err);
    return false;
  }
}

// Query Vectorize for top similar entries
export async function queryVectors(
  vectorizeBinding: any,
  values: number[],
  topK: number = 5
): Promise<VectorMatch[]> {
  if (!vectorizeBinding) {
    console.warn('[Vector] Vectorize binding is missing. Cannot query vectors.');
    return [];
  }
  try {
    const res = await vectorizeBinding.query(values, {
      topK,
      returnValues: false,
      returnMetadata: true
    });
    if (res && res.matches) {
      return res.matches.map((m: any) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata
      }));
    }
  } catch (err) {
    console.error('[Vector] Vectorize query failed:', err);
  }
  return [];
}

// Delete vector from Vectorize
export async function deleteVector(vectorizeBinding: any, id: string): Promise<boolean> {
  if (!vectorizeBinding) return false;
  try {
    await vectorizeBinding.delete([id]);
    return true;
  } catch (err) {
    console.error('[Vector] Vectorize delete failed:', err);
    return false;
  }
}
