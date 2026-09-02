import { AboutSection } from '@/components/profile/about-section'
import { GallerySection } from '@/components/profile/gallery-section'
import { ProfileHeader } from '@/components/profile/profile-header'
import { ReviewsSection } from '@/components/profile/reviews-section'
import { AssignedToursSection } from '@/components/profile/assigned-tours-section'
import { GuideTierBadge } from '@/components/guide_tours/guide-tier-badge'
import { SpecialtiesSection } from '@/components/profile/specialties-section'
import { BackButton } from '@/components/shared/back-button'
import { headers } from 'next/headers'

export default async function PublicProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = id

  type Profile = {
    bio?: string | null
    languages?: string[] | null
    specialties?: string[] | null
    profile_picture_path?: string | null
    cover_image_path?: string | null
    intro_video_path?: string | null
    intro_photos_paths?: string[] | null
    document?: string[] | null
    avatarUrl?: string | null
    country?: string | null
    city?: string | null
  }

  let profile: Profile | null = null
  let firstName: string | null = null
  let lastName: string | null = null
  let assignedTours: Array<{
    id: string
    name: string
    location: string
    country: string
    activityType: string
    status: string
    image: string | null
    operatorId: string
    operatorName: string
  }> = []
  let guideTier: string | null = null

  // Get base URL for API calls
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const baseUrl = `${protocol}://${host}`

  try {
    // Fetch profile data from API route (id is user_id)
    const response = await fetch(`${baseUrl}/api/profile/${userId}`, {
      cache: 'no-store',
    })

    if (response.ok) {
      const data = await response.json()
      if (data.ok && data.profile) {
        profile = data.profile
        firstName = data.user?.first_name || null
        lastName = data.user?.last_name || null
        assignedTours = data.assignedTours || []
        guideTier = data.user?.guideTier || null
      }
    }
  } catch (error) {
    console.error('Error fetching profile:', error)
    // Profile will remain null if fetch fails
  }

  return (
    <main className="min-h-screen container mx-auto bg-background p-10">
      <div className="mb-6">
        <div className="inline-flex items-center text-2xl text-[#D4AA25]">
          <BackButton label="Back" className="inline-flex items-center text-2xl text-[#D4AA25] cursor-pointer" />
        </div>
      </div>
      <ProfileHeader profile={profile ?? undefined} name={firstName ?? undefined} lastName={lastName ?? undefined} />
      {guideTier && (
        <div className="mt-4">
          <GuideTierBadge tier={guideTier} />
        </div>
      )}
      <div className="py-8 md:py-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AboutSection bio={profile?.bio ?? undefined} languages={profile?.languages ?? undefined} />
        <SpecialtiesSection specialties={profile?.specialties ?? undefined} documents={profile?.document ?? undefined} />
      </div>
      <GallerySection profile={profile ?? undefined} />
      <AssignedToursSection tours={assignedTours} />
      <ReviewsSection userId={userId} />
    </main>
  )
}
