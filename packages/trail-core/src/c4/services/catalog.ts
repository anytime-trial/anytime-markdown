import {
  siSupabase, siNetlify, siVercel, siCloudflare, siRender, siDigitalocean,
  siUpstash, siStripe, siGooglecloud, siSentry,
  siMongodb, siRedis, siFirebase, siPlanetscale, siTurso,
  siAuth0, siClerk,
  siGithubactions, siCircleci,
  siRailway, siFlydotio, siAppwrite,
} from 'simple-icons';

export interface ServiceEntry {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly brandColor: string;
  readonly iconPath: string;
}

export const SERVICE_CATALOG: readonly ServiceEntry[] = [
  // Database
  { id: 'supabase',     label: 'Supabase',       category: 'Database', brandColor: `#${siSupabase.hex}`,     iconPath: siSupabase.path },
  { id: 'mongodb',      label: 'MongoDB',         category: 'Database', brandColor: `#${siMongodb.hex}`,      iconPath: siMongodb.path },
  { id: 'redis',        label: 'Redis',           category: 'Database', brandColor: `#${siRedis.hex}`,        iconPath: siRedis.path },
  { id: 'firebase',     label: 'Firebase',        category: 'Database', brandColor: `#${siFirebase.hex}`,     iconPath: siFirebase.path },
  { id: 'planetscale',  label: 'PlanetScale',     category: 'Database', brandColor: `#${siPlanetscale.hex}`,  iconPath: siPlanetscale.path },
  { id: 'turso',        label: 'Turso',           category: 'Database', brandColor: `#${siTurso.hex}`,        iconPath: siTurso.path },
  { id: 'upstash',      label: 'Upstash',         category: 'Database', brandColor: `#${siUpstash.hex}`,      iconPath: siUpstash.path },
  // Hosting
  { id: 'netlify',      label: 'Netlify',         category: 'Hosting',  brandColor: `#${siNetlify.hex}`,      iconPath: siNetlify.path },
  { id: 'vercel',       label: 'Vercel',          category: 'Hosting',  brandColor: `#${siVercel.hex}`,       iconPath: siVercel.path },
  { id: 'cloudflare',   label: 'Cloudflare',      category: 'Hosting',  brandColor: `#${siCloudflare.hex}`,   iconPath: siCloudflare.path },
  { id: 'render',       label: 'Render',          category: 'Hosting',  brandColor: `#${siRender.hex}`,       iconPath: siRender.path },
  { id: 'railway',      label: 'Railway',         category: 'Hosting',  brandColor: `#${siRailway.hex}`,      iconPath: siRailway.path },
  { id: 'digitalocean', label: 'DigitalOcean',    category: 'Hosting',  brandColor: `#${siDigitalocean.hex}`, iconPath: siDigitalocean.path },
  { id: 'flydotio',     label: 'Fly.io',          category: 'Hosting',  brandColor: `#${siFlydotio.hex}`,     iconPath: siFlydotio.path },
  // Auth
  { id: 'auth0',        label: 'Auth0',           category: 'Auth',     brandColor: `#${siAuth0.hex}`,        iconPath: siAuth0.path },
  { id: 'clerk',        label: 'Clerk',           category: 'Auth',     brandColor: `#${siClerk.hex}`,        iconPath: siClerk.path },
  // Cloud
  { id: 'googlecloud',  label: 'Google Cloud',    category: 'Cloud',    brandColor: `#${siGooglecloud.hex}`,  iconPath: siGooglecloud.path },
  // Backend
  { id: 'appwrite',     label: 'Appwrite',        category: 'Backend',  brandColor: `#${siAppwrite.hex}`,     iconPath: siAppwrite.path },
  // Payments
  { id: 'stripe',       label: 'Stripe',          category: 'Payments', brandColor: `#${siStripe.hex}`,       iconPath: siStripe.path },
  // Monitoring
  { id: 'sentry',       label: 'Sentry',          category: 'Monitoring', brandColor: `#${siSentry.hex}`,     iconPath: siSentry.path },
  // CI/CD
  { id: 'githubactions', label: 'GitHub Actions', category: 'CI/CD',    brandColor: `#${siGithubactions.hex}`, iconPath: siGithubactions.path },
  { id: 'circleci',     label: 'CircleCI',        category: 'CI/CD',    brandColor: `#${siCircleci.hex}`,     iconPath: siCircleci.path },
];

export function findService(id: string): ServiceEntry | undefined {
  return SERVICE_CATALOG.find(s => s.id === id);
}

export function filterServices(query: string): readonly ServiceEntry[] {
  if (!query.trim()) return SERVICE_CATALOG;
  const q = query.toLowerCase();
  return SERVICE_CATALOG.filter(
    s => s.label.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
  );
}
