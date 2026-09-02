"use client"
import ProfileSetupProgress from "./profile-setup-progress"
import ProfileInfo from "./profile-info"
import AboutMe from "./about-me"
import IntroPhotos from "./intro-photos"
import IntroVideo from "./intro-video"
import TourSpecialties from "./tour-specialties"
import CoverImage from "./cover-image"
import GuideMarketplaceSection from "./guide-marketplace-section"
import { useBootstrap } from "@/components/shared/bootstrap-context"

export default function ProfileTab() {
    const { user } = useBootstrap()
    const isGuide = user?.role === "guide"

    if (isGuide) {
        return (
            <div className="space-y-4 lg:space-y-6">
                <GuideMarketplaceSection />
            </div>
        )
    }

    return (
        <div className="space-y-4 lg:space-y-6">
            <ProfileInfo />
            <AboutMe />
            <TourSpecialties />
            <CoverImage />
            <IntroVideo />
            <IntroPhotos />
            <ProfileSetupProgress />
        </div>
    )
}
