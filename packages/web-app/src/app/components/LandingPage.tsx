import { Playfair_Display } from 'next/font/google';

import LandingBody from './LandingBody';
import LandingHeader from './LandingHeader';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['700'], display: 'swap' });

const headingFontFamily = `${playfair.style.fontFamily}, Georgia, "Times New Roman", serif`;

export default function LandingPage() {
  return (
    <div className="landing-scroll" style={{ minHeight: '100vh', overflow: 'auto' }}>
      <LandingHeader />
      <LandingBody headingFontFamily={headingFontFamily} />
    </div>
  );
}
