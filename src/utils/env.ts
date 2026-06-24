// src/utils/env.ts

export async function getEnv(): Promise<any> {
  try {
    // Dynamically import virtual module to prevent static build-time failures in CLI/Node.js context
    const cloudflare = await import('cloudflare:workers');
    return cloudflare.env;
  } catch {
    // Fallback to process.env during local CLI script executions (like npx tsx)
    return typeof process !== 'undefined' ? process.env : {};
  }
}
