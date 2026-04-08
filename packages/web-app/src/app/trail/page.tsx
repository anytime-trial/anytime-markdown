'use client';

import dynamic from 'next/dynamic';

import LandingHeader from '../components/LandingHeader';

const TrailViewer = dynamic(
  () => import('./components/TrailViewer').then(m => ({ default: m.TrailViewer })),
  { ssr: false },
);

export default function TrailPage() {
  return (
    <>
      <LandingHeader />
      <TrailViewer />
    </>
  );
}
