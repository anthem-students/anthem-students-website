// The only app left is /roster, which returns its own raw HTML from a route
// handler and never renders inside this layout. Next still needs a root layout
// for its built-in 404 page, so this stays as bare as it can be.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
