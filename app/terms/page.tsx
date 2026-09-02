export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="space-y-8 text-foreground">
            {/* 1. Acceptance of Terms */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing and using Pagoda.travel (&quot;the Platform&quot;), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these Terms of Service, please do not use our services.
              </p>
            </section>

            {/* 2. Description of Service */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Pagoda.travel is a platform that connects travelers with local tour guides. We provide:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>A marketplace for tour guide services</li>
                <li>Communication tools between agencies and guides</li>
                <li>Booking and scheduling features</li>
                <li>Payment processing services</li>
                <li>Profile and itinerary management</li>
              </ul>
            </section>

            {/* 3. User Accounts */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">3. User Accounts</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                To use certain features of the Platform, you must register for an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Keep your password secure and confidential</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
            </section>

            {/* 4. User Roles */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">4. User Roles</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Tour Guides</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Tour guides agree to provide accurate information about their qualifications, availability, and services. You are responsible for the quality and safety of tours provided.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">Agencies</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Agencies agree to post legitimate job opportunities and treat guides fairly. You are responsible for honoring commitments made through the Platform.
                  </p>
                </div>
              </div>
            </section>

            {/* 5. Prohibited Activities */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Prohibited Activities</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Violate any laws or regulations</li>
                <li>Post false, misleading, or fraudulent content</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to gain unauthorized access to the Platform</li>
                <li>Use automated systems to access the Platform</li>
                <li>Infringe on intellectual property rights</li>
                <li>Circumvent payment systems or fees</li>
              </ul>
            </section>

            {/* 6. Content and Intellectual Property */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Content and Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                You retain ownership of content you post on the Platform. By posting content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content on the Platform.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                The Platform&apos;s design, code, and original content are owned by Pagoda.travel and protected by copyright laws.
              </p>
            </section>

            {/* 7. Payments and Fees */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Payments and Fees</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Platform fees and commission rates will be clearly communicated. You agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Pay all applicable fees as described on the Platform</li>
                <li>Provide valid payment information</li>
                <li>Accept that all fees are non-refundable unless stated otherwise</li>
                <li>Understand that payment processing is handled by third-party providers</li>
              </ul>
            </section>

            {/* 8. Cancellations and Refunds */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Cancellations and Refunds</h2>
              <p className="text-muted-foreground leading-relaxed">
                Cancellation and refund policies are set by individual tour guides and agencies. Disputes should be resolved directly between parties. Pagoda.travel may assist in dispute resolution but is not liable for refunds.
              </p>
            </section>

            {/* 9. Disclaimer of Warranties */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                THE PLATFORM IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THE ACCURACY, RELIABILITY, OR QUALITY OF USER-GENERATED CONTENT OR SERVICES. WE ARE NOT RESPONSIBLE FOR THE CONDUCT OF USERS OR THE QUALITY OF TOURS PROVIDED.
              </p>
            </section>

            {/* 10. Limitation of Liability */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAGODA.TRAVEL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR USE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE PAST TWELVE MONTHS.
              </p>
            </section>

            {/* 11. Indemnification */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify and hold harmless Pagoda.travel from any claims, damages, losses, or expenses arising from your use of the Platform, violation of these Terms, or infringement of any rights of another party.
              </p>
            </section>

            {/* 12. Privacy */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">12. Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your use of the Platform is also governed by our Privacy Policy. Please review our Privacy Policy to understand our data collection and usage practices.
              </p>
            </section>

            {/* 13. Termination */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">13. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to suspend or terminate your account at any time for any reason, including violation of these Terms. You may terminate your account at any time by contacting us. Upon termination, your right to use the Platform will immediately cease.
              </p>
            </section>

            {/* 14. Changes to Terms */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">14. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of significant changes via email or platform notification. Continued use of the Platform after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            {/* 15. Governing Law */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">15. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions.
              </p>
            </section>

            {/* 16. Contact Information */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">16. Contact Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                <p className="text-sm">Email: support@pagoda.travel</p>
                <p className="text-sm">Website: https://pagoda.travel</p>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              By using Pagoda.travel, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
