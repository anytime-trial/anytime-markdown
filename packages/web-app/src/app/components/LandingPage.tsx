import { Playfair_Display } from 'next/font/google';
import LandingHeader from './LandingHeader';
import LandingBody from './LandingBody';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['700'], display: 'swap' });

const headingFontFamily = `${playfair.style.fontFamily}, Georgia, "Times New Roman", serif`;

export default function LandingPage() {
  return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <LandingHeader />
      <LandingBody headingFontFamily={headingFontFamily} />
    </div>
  );
}
