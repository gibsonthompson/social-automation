import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata = {
  title: 'Social Media Farm',
  description: 'Scheduling, publishing and performance for every brand in one place',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07090E',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
