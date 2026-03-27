import './globals.css';

export const metadata = {
  title: 'Content Farm | Multi-Brand Engine',
  description: 'AI-powered social media content generation for multiple businesses',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
