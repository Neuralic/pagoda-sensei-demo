export const  BUCKETS = {
  avatars: "avatars",
  coverImages: "cover-images",
  introPhotos: "intro-photos",
  introVideos: "intro-videos",
  documents: "documents",
  itineraries: "itineraries",
  jobs: "jobs",
  tours: "tours",
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]
