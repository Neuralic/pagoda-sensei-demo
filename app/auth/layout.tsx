export const metadata = {
  title: 'Auth',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* <header style={{ marginBottom: 16 }}>
        <h2>Auth Area</h2>
        <p style={{ margin: 0 }}>Signup / Login / Password routes</p>
      </header> */}
      <main>{children}</main>
    </div>
  );
}
