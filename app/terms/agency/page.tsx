export default function AgencyTermsPage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-8 md:p-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              PAGODA TRAVEL PARTNERSHIP AGREEMENT
            </h1>
            <h2 className="text-xl md:text-2xl font-semibold text-muted-foreground mb-6">
              For Travel Agents
            </h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><strong>Between:</strong> Pagoda Travel Limited (&quot;Pagoda Travel&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;)</p>
              <p><strong>And:</strong> The undersigned Travel Agent (&quot;Agent&quot;, &quot;you&quot;, &quot;your&quot;)</p>
            </div>
          </div>

          <hr className="my-8 border-border" />

          <div className="space-y-10 text-foreground">
            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">1. ACCEPTANCE OF TERMS</h2>
              <p className="text-muted-foreground leading-relaxed">
                By subscribing to any Pagoda Travel service and checking the agreement box during the subscription process, you agree to be bound by this Partnership Agreement. This document provides the full terms that you accepted during sign-up.
              </p>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">2. PLATFORM USE AND RESTRICTIONS</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">2.1 Permitted Use</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    You may use the Pagoda Travel platform to:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Browse and select tours from our Tour Library</li>
                    <li>Build itineraries using available tours and services</li>
                    <li>Communicate with tour guides and operators through our platform</li>
                    <li>Manage bookings and client proposals</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">2.2 Prohibited Conduct - Direct Contact</h3>
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                    <p className="font-semibold text-red-900 mb-2">You expressly agree that you will NOT:</p>
                    <ul className="list-disc list-inside text-red-800 space-y-2 ml-4 text-sm">
                      <li>Contact any tour guide, operator, or service provider listed on Pagoda Travel outside of our platform</li>
                      <li>Request or use personal contact information (phone numbers, email addresses, WhatsApp, social media, etc.) of guides or operators for direct communication</li>
                      <li>Circumvent the Pagoda Travel platform to arrange tours, bookings, or services directly with our guides or operators</li>
                      <li>Share guide or operator contact information with third parties for the purpose of bypassing our platform</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border-l-4 border-green-500 p-4">
                    <p className="font-semibold text-green-900 mb-2">Exception:</p>
                    <p className="text-green-800 text-sm">
                      Contact information may be shared with your end clients 1-2 days before their scheduled tour, solely for tour logistics and emergencies during the tour period.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">2.3 Consequences of Violation</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Violation of Section 2.2 will result in:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Immediate termination of your account</li>
                    <li>Loss of access to all platform features and data</li>
                    <li>Potential legal action for breach of contract</li>
                    <li>Forfeiture of any referral commissions or benefits</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3. LIMITATION OF LIABILITY</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">3.1 No Guarantee of Service Delivery</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Pagoda Travel acts as a marketplace platform connecting travel agents with independent tour guides and operators. <strong>We do not guarantee:</strong>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>The quality, safety, or delivery of any tour or service</li>
                    <li>The accuracy of information provided by guides or operators</li>
                    <li>The availability of guides or operators at the time of booking</li>
                    <li>The conduct or performance of any guide, operator, or service provider</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">3.2 Independent Contractors</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    All tour guides and operators on our platform are independent contractors. They are not employees or agents of Pagoda Travel. We do not control their day-to-day operations, tour execution, or business practices.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">3.3 Your Responsibility</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    You are responsible for:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Vetting tours and services for your clients&apos; needs</li>
                    <li>Verifying guide credentials and insurance coverage</li>
                    <li>Communicating booking details accurately</li>
                    <li>Managing your client relationships and expectations</li>
                    <li>Obtaining appropriate travel insurance for your clients</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">3.4 Exclusion of Liability</h3>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                    <p className="font-semibold text-yellow-900 mb-2">
                      To the fullest extent permitted by law, Pagoda Travel shall not be liable for:
                    </p>
                    <ul className="list-disc list-inside text-yellow-800 space-y-2 ml-4 text-sm">
                      <li>Any injury, loss, damage, delay, or inconvenience experienced by you or your clients</li>
                      <li>Actions, errors, omissions, or negligence of any guide, operator, or service provider</li>
                      <li>Cancellations, no-shows, or substandard service delivery</li>
                      <li>Force majeure events (natural disasters, political unrest, pandemics, etc.)</li>
                      <li>Any direct, indirect, incidental, consequential, or punitive damages</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4. INTELLECTUAL PROPERTY</h2>
              <p className="text-muted-foreground leading-relaxed">
                All content on the Pagoda Travel platform, including but not limited to tour descriptions, photos, logos, and platform design, remains the property of Pagoda Travel or its content providers. You may not reproduce, distribute, or use this content outside the platform without written permission.
              </p>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5. DATA AND PRIVACY</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your use of the platform is subject to our Privacy Policy. We collect and process data in accordance with applicable data protection laws. You agree to handle any client data responsibly and in compliance with relevant privacy regulations.
              </p>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6. SUBSCRIPTION AND PAYMENT TERMS</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Pagoda Foundation:</strong> Free access to Japan-based services only</li>
                <li><strong>Pagoda Pro:</strong> $199/month for full global marketplace access</li>
                <li>Payment terms, refund policies, and subscription details are governed by our separate Billing Terms</li>
                <li>Subscription fees are non-refundable except as required by law</li>
              </ul>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7. TERMINATION</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">7.1 By You</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    You may terminate this agreement at any time by closing your account through the platform settings or by contacting us.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">7.2 By Us</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    We reserve the right to suspend or terminate your account immediately if you:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Violate any provision of this agreement</li>
                    <li>Engage in fraudulent or illegal activity</li>
                    <li>Damage the reputation or operation of our platform</li>
                    <li>Fail to pay subscription fees</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">7.3 Effect of Termination</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Upon termination:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Your access to the platform will be revoked</li>
                    <li>You must cease all use of Pagoda Travel branding and materials</li>
                    <li>Any outstanding payment obligations remain due</li>
                    <li>Sections 2.2, 3, 4, and 8 survive termination</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">8. GENERAL PROVISIONS</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">8.1 Entire Agreement</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    This agreement, together with our Terms of Service, Privacy Policy, and other policies referenced herein, constitutes the entire agreement between you and Pagoda Travel.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">8.2 Amendments</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    We reserve the right to modify this agreement at any time. Continued use of the platform after changes constitutes acceptance of the modified terms.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">8.3 Governing Law</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    This agreement shall be governed by and construed in accordance with the laws of [Insert Jurisdiction], without regard to conflict of law principles.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">8.4 Severability</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    If any provision of this agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.
                  </p>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">9. FULL TERMS AND CONDITIONS</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <p className="text-blue-900 font-semibold mb-2">
                  For complete terms and conditions, please visit:
                </p>
                <a 
                  href="https://www.pagodatravel.com/terms-and-conditions" 
                  className="text-blue-600 hover:text-blue-800 underline text-lg"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.pagodatravel.com/terms-and-conditions
                </a>
                <p className="text-blue-800 text-sm mt-4">
                  This document contains essential terms but does not replace our comprehensive Terms of Service available on our website.
                </p>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">10. YOUR AGREEMENT</h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <p className="text-muted-foreground leading-relaxed mb-4">
                  By checking the acceptance box during your subscription sign-up, you confirmed that you have read, understood, and agreed to this Partnership Agreement, including:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                  <li>Using the Pagoda Travel platform only as permitted herein</li>
                  <li>Not contacting guides or operators outside the platform</li>
                  <li>Understanding that Pagoda Travel is not responsible for service delivery by independent guides and operators</li>
                  <li>Agreeing to the full Terms and Conditions available at www.pagoda.travel</li>
                </ul>
                <p className="text-muted-foreground text-sm mt-4 italic">
                  This page is provided for your reference and records.
                </p>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border text-center">
            <p className="text-muted-foreground italic">
              Pagoda Travel Limited | Building Connections in Travel
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
