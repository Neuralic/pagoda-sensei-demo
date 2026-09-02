// Shared in-memory store for chunk uploads
// In production, consider using Redis or a database for persistence across serverless instances

type ChunkUpload = {
  chunks: Map<number, Uint8Array>
  totalChunks: number
  bucket: string
  path: string
  contentType: string
}

export const chunkStore = new Map<string, ChunkUpload>()

