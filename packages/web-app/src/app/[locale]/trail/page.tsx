'use client';

import dynamic from 'next/dynamic';

import LandingHeader from '../components/LandingHeader';
import { TrailViewerSkeleton } from './components/TrailViewerSkeleton';

const TrailViewer = dynamic(
  () => import('./components/TrailViewer').then(m => ({ default: m.TrailViewer })),
  {
    ssr: false,
    loading: () => <TrailViewerSkeleton />,
  },
);

export default function TrailPage() {
  return (
    <>
      <LandingHeader />
      <TrailViewer />
    </>
  );
}
