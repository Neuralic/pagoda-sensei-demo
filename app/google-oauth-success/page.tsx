// Success page that closes popup after OAuth
// Cookies are already set by the callback route redirect response

export default function GoogleOAuthSuccessPage() {
  // Cookies are already set by the redirect response from /api/google/callback
  // This page just needs to send a message to the parent and close
  
  return (
      <html>
        <head>
          <title>Authentication Successful</title>
        </head>
        <body style={{ padding: '24px', textAlign: 'center', fontFamily: 'system-ui' }}>
          <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: '12px', maxWidth: '400px', margin: '0 auto' }}>
            <div style={{ color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              ✅ Authorization successful! Closing window...
            </div>
          </div>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  // Wait a moment for cookies to be set by the redirect
                  setTimeout(() => {
                    if (window.opener && !window.opener.closed) {
                      try {
                        window.opener.postMessage({
                          type: 'GOOGLE_AUTH_COOKIE_SUCCESS'
                        }, window.location.origin);
                        console.log('Success message sent to parent window');
                      } catch (e) {
                        console.error('Failed to send message:', e);
                      }
                    }
                    
                    setTimeout(() => {
                      window.close();
                    }, 500);
                  }, 1000);
                })();
              `,
            }}
          />
        </body>
      </html>
    )
}

