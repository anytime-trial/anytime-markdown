'use client';

import dynamic from 'next/dynamic';

import LandingHeader from '../components/LandingHeader';

const C4Viewer = dynamic(
  () => import('./components/C4Viewer').then(m => ({ default: m.C4Viewer })),
  { ssr: false },
);

export default function C4Page() {
  return (
    <>
      <LandingHeader />
      <C4Viewer />
    </>
  );
}
