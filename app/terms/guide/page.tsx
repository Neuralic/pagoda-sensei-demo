export default function GuideTermsPage() {
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
              For Tour Guides, Tour Operators & DMCs
            </h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><strong>Between:</strong> Pagoda Travel Limited (&quot;Pagoda Travel&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;)</p>
              <p><strong>And:</strong> The undersigned Guide/Operator (&quot;Guide&quot;, &quot;you&quot;, &quot;your&quot;)</p>
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
                    <li>Upload and manage your tours, services, and offerings</li>
                    <li>Communicate with travel agents through our platform</li>
                    <li>Receive and manage bookings from agents</li>
                    <li>Collaborate with other guides and operators on the platform</li>
                    <li>Bid on agent wishlist opportunities</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">2.2 Prohibited Conduct - Direct Contact</h3>
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                    <p className="font-semibold text-red-900 mb-2">You expressly agree that you will NOT:</p>
                    <ul className="list-disc list-inside text-red-800 space-y-2 ml-4 text-sm">
                      <li>Contact any travel agent listed on Pagoda Travel outside of our platform for business purposes related to tours or services available on the platform</li>
                      <li>Request or use personal contact information (phone numbers, email addresses, WhatsApp, social media, etc.) of agents for direct solicitation</li>
                      <li>Circumvent the Pagoda Travel platform to arrange tours, bookings, or services directly with agents</li>
                      <li>Solicit agents to work with you outside the Pagoda Travel marketplace</li>
                      <li>Share agent contact information with third parties for the purpose of bypassing our platform</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border-l-4 border-green-500 p-4">
                    <p className="font-semibold text-green-900 mb-2">Exception:</p>
                    <p className="text-green-800 text-sm">
                      You may share your guide&apos;s WhatsApp contact information with end clients 1-2 days before their scheduled tour, solely for tour logistics and emergencies during the tour period, as provided by the platform.
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
                    <li>Removal of all your tours and services from the platform</li>
                    <li>Loss of access to all platform features and pending bookings</li>
                    <li>Potential legal action for breach of contract</li>
                    <li>Forfeiture of any commissions or payments in process</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3. YOUR RESPONSIBILITIES AS AN INDEPENDENT OPERATOR</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">3.1 Independent Contractor Status</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    You acknowledge and agree that:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>You are an independent contractor, not an employee or agent of Pagoda Travel</li>
                    <li>You are solely responsible for the delivery, quality, and safety of your tours and services</li>
                    <li>You maintain complete control over how you conduct your tours and operate your business</li>
                    <li>Pagoda Travel has no authority over your day-to-day operations</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">3.2 Professional Requirements</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    You are responsible for:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li><strong>Insurance Coverage:</strong> Maintaining adequate liability insurance for your tour operations</li>
                    <li><strong>Licenses and Permits:</strong> Obtaining all necessary business licenses, tour operator permits, and legal authorizations required in your jurisdiction</li>
                    <li><strong>Accurate Information:</strong> Providing truthful and accurate descriptions, pricing, and details about your tours</li>
                    <li><strong>Service Delivery:</strong> Fulfilling all confirmed bookings professionally and as described</li>
                    <li><strong>Safety Standards:</strong> Following all applicable safety regulations and industry best practices</li>
                    <li><strong>Communication:</strong> Responding promptly to agent inquiries and booking requests</li>
                    <li><strong>Legal Compliance:</strong> Complying with all local, regional, and national laws governing tour operations</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">3.3 Insurance Confirmation</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    By using this platform, you confirm that you maintain appropriate insurance coverage for your tour operations. Pagoda Travel may request proof of insurance at any time, and failure to provide it may result in account suspension.
                  </p>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4. LIMITATION OF LIABILITY</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">4.1 Platform Role</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Pagoda Travel operates as a marketplace platform connecting tour guides and operators with travel agents. <strong>We do not:</strong>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Guarantee bookings or a minimum volume of business</li>
                    <li>Control or supervise your tour operations</li>
                    <li>Assume liability for your actions, services, or conduct</li>
                    <li>Verify the credentials of agents beyond basic registration</li>
                    <li>Act as a party to agreements between you and agents</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">4.2 Exclusion of Liability</h3>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                    <p className="font-semibold text-yellow-900 mb-2">
                      To the fullest extent permitted by law, Pagoda Travel shall not be liable for:
                    </p>
                    <ul className="list-disc list-inside text-yellow-800 space-y-2 ml-4 text-sm">
                      <li>Any injury, loss, damage, delay, or incident occurring during your tours</li>
                      <li>Disputes between you and travel agents or their clients</li>
                      <li>Cancellations, payment disputes, or booking issues</li>
                      <li>Your failure to deliver services as promised</li>
                      <li>Negative reviews or reputational damage</li>
                      <li>Force majeure events (natural disasters, political unrest, pandemics, etc.)</li>
                      <li>Any direct, indirect, incidental, consequential, or punitive damages arising from your use of the platform</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">4.3 Indemnification</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    You agree to indemnify and hold harmless Pagoda Travel from any claims, damages, losses, or expenses (including legal fees) arising from:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Your tour operations and service delivery</li>
                    <li>Your violation of this agreement</li>
                    <li>Your negligence or misconduct</li>
                    <li>Any injury or damage caused during your tours</li>
                    <li>Your violation of applicable laws or regulations</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5. TOUR CONTENT AND PRICING</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">5.1 Tour Listings</h3>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>You are responsible for all content in your tour listings, including descriptions, photos, itineraries, and pricing</li>
                    <li>You grant Pagoda Travel a non-exclusive license to display and promote your tour content on our platform</li>
                    <li>You must ensure you have the right to use any photos or content you upload</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">5.2 Pricing Information</h3>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Tour pricing is visible to Pagoda Travel administrators but hidden from agents on the platform</li>
                    <li>You agree that pricing information will be used for platform administration and reporting purposes only</li>
                    <li>You are responsible for setting competitive and accurate pricing</li>
                    <li>All prices must include any applicable taxes unless otherwise specified</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6. INTELLECTUAL PROPERTY</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">6.1 Your Content</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    You retain ownership of your tour descriptions, photos, and content. However, by uploading to Pagoda Travel, you grant us a worldwide, non-exclusive license to use, display, and promote your content on our platform and marketing materials.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">6.2 Platform Content</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    All Pagoda Travel branding, logos, platform design, and functionality remain our exclusive property. You may not use our intellectual property outside the platform without written permission.
                  </p>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7. DATA AND PRIVACY</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Your use of the platform is subject to our Privacy Policy. You agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Handle any client data responsibly and in compliance with data protection laws</li>
                <li>Not use client information for purposes outside the specific booking</li>
                <li>Maintain confidentiality of agent and client information</li>
              </ul>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">8. SUBSCRIPTION AND PAYMENT TERMS</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Pagoda Foundation (Free):</strong> Available for guides offering Japan-based services only</li>
                <li><strong>Pagoda Explorer:</strong> $199/month for full platform access and collaboration features</li>
                <li>Payment terms, refund policies, and subscription details are governed by our separate Billing Terms</li>
                <li>Subscription fees are non-refundable except as required by law</li>
                <li>Payment for tours is handled according to separate payment processing agreements</li>
              </ul>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">9. TERMINATION</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">9.1 By You</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    You may terminate this agreement at any time by closing your account through the platform settings or by contacting us. Any pending bookings must be honored.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">9.2 By Us</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    We reserve the right to suspend or terminate your account immediately if you:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Violate any provision of this agreement</li>
                    <li>Engage in fraudulent, illegal, or unethical activity</li>
                    <li>Receive consistently poor reviews or complaints</li>
                    <li>Fail to deliver services as promised</li>
                    <li>Fail to maintain required insurance or licenses</li>
                    <li>Damage the reputation or operation of our platform</li>
                    <li>Fail to pay subscription fees</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">9.3 Effect of Termination</h3>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Upon termination:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>Your access to the platform will be revoked</li>
                    <li>Your tour listings will be removed</li>
                    <li>You must cease all use of Pagoda Travel branding and materials</li>
                    <li>You remain responsible for completing any confirmed bookings</li>
                    <li>Any outstanding payment obligations remain due</li>
                    <li>Sections 2.2, 3, 4, 5.2, 6, and 10 survive termination</li>
                  </ul>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">10. GENERAL PROVISIONS</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">10.1 Entire Agreement</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    This agreement, together with our Terms of Service, Privacy Policy, and other policies referenced herein, constitutes the entire agreement between you and Pagoda Travel.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">10.2 Amendments</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    We reserve the right to modify this agreement at any time. Continued use of the platform after changes constitutes acceptance of the modified terms.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">10.3 Governing Law</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    This agreement shall be governed by and construed in accordance with the laws of [Insert Jurisdiction], without regard to conflict of law principles.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">10.4 Severability</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    If any provision of this agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.
                  </p>
                </div>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 11 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">11. FULL TERMS AND CONDITIONS</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <p className="text-blue-900 font-semibold mb-2">
                  For complete terms and conditions, please visit:
                </p>
                <a 
                  href="https://www.pagoda.travel/terms-and-conditions" 
                  className="text-blue-600 hover:text-blue-800 underline text-lg"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.pagoda.travel/terms-and-conditions
                </a>
                <p className="text-blue-800 text-sm mt-4">
                  This document contains essential terms but does not replace our comprehensive Terms of Service available on our website.
                </p>
              </div>
            </section>

            <hr className="my-8 border-border" />

            {/* Section 12 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">12. YOUR AGREEMENT</h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <p className="text-muted-foreground leading-relaxed mb-4">
                  By checking the acceptance box during your subscription sign-up, you confirmed that you have read, understood, and agreed to this Partnership Agreement, including:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                  <li>Using the Pagoda Travel platform only as permitted herein</li>
                  <li>Not contacting travel agents outside the platform for business purposes</li>
                  <li>Operating as an independent contractor responsible for your own tour operations</li>
                  <li>Maintaining adequate insurance coverage for your tour activities</li>
                  <li>Understanding that Pagoda Travel is not responsible for your service delivery or any incidents during your tours</li>
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
