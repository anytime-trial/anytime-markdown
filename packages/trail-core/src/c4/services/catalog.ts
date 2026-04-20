import {
  siSupabase, siNetlify, siVercel, siCloudflare, siRender, siDigitalocean,
  siUpstash, siStripe, siGooglecloud, siSentry,
  siMongodb, siRedis, siFirebase, siPlanetscale, siTurso,
  siAuth0, siClerk,
  siGithubactions, siCircleci,
  siRailway, siFlydotio, siAppwrite,
  // Database (extended)
  siPostgresql, siMysql, siSqlite, siElasticsearch, siCockroachlabs,
  siConvex, siPocketbase,
  // Infrastructure
  siDocker, siKubernetes, siNginx, siVultr,
  // Auth (extended)
  siOkta, siKeycloak,
  // Cloud (extended)
  siExoscale,
  // Monitoring (extended)
  siDatadog, siGrafana, siNewrelic, siPrometheus, siPosthog,
  // CI/CD (extended)
  siGitlab, siJenkins, siTravisci, siBitbucket,
  // Messaging
  siApachekafka, siResend,
  // CMS
  siContentful, siStrapi, siSanity, siWordpress, siGhost,
  // CDN / Media
  siCloudinary, siFastly,
  // Search
  siAlgolia,
  // Analytics
  siMixpanel,
} from 'simple-icons';

export interface ServiceEntry {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly brandColor: string;
  /** simple-icons: single SVG path d attribute (24×24 viewBox) */
  readonly iconPath?: string;
  /** @iconify-json/logos: SVG body HTML (multi-color, multi-element) */
  readonly iconBody?: string;
  /** viewBox for iconBody, e.g. "0 0 256 256" */
  readonly iconViewBox?: string;
}

export const SERVICE_CATALOG: readonly ServiceEntry[] = [
  // Database
  { id: 'supabase',      label: 'Supabase',        category: 'Database',       brandColor: `#${siSupabase.hex}`,       iconPath: siSupabase.path },
  { id: 'postgresql',    label: 'PostgreSQL',       category: 'Database',       brandColor: `#${siPostgresql.hex}`,     iconPath: siPostgresql.path },
  { id: 'mysql',         label: 'MySQL',            category: 'Database',       brandColor: `#${siMysql.hex}`,          iconPath: siMysql.path },
  { id: 'sqlite',        label: 'SQLite',           category: 'Database',       brandColor: `#${siSqlite.hex}`,         iconPath: siSqlite.path },
  { id: 'mongodb',       label: 'MongoDB',          category: 'Database',       brandColor: `#${siMongodb.hex}`,        iconPath: siMongodb.path },
  { id: 'redis',         label: 'Redis',            category: 'Database',       brandColor: `#${siRedis.hex}`,          iconPath: siRedis.path },
  { id: 'firebase',      label: 'Firebase',         category: 'Database',       brandColor: `#${siFirebase.hex}`,       iconPath: siFirebase.path },
  { id: 'planetscale',   label: 'PlanetScale',      category: 'Database',       brandColor: `#${siPlanetscale.hex}`,    iconPath: siPlanetscale.path },
  { id: 'turso',         label: 'Turso',            category: 'Database',       brandColor: `#${siTurso.hex}`,          iconPath: siTurso.path },
  { id: 'upstash',       label: 'Upstash',          category: 'Database',       brandColor: `#${siUpstash.hex}`,        iconPath: siUpstash.path },
  { id: 'elasticsearch', label: 'Elasticsearch',    category: 'Database',       brandColor: `#${siElasticsearch.hex}`,  iconPath: siElasticsearch.path },
  { id: 'cockroachlabs', label: 'CockroachDB',      category: 'Database',       brandColor: `#${siCockroachlabs.hex}`,  iconPath: siCockroachlabs.path },
  { id: 'convex',        label: 'Convex',           category: 'Database',       brandColor: `#${siConvex.hex}`,         iconPath: siConvex.path },
  { id: 'pocketbase',    label: 'PocketBase',       category: 'Database',       brandColor: `#${siPocketbase.hex}`,     iconPath: siPocketbase.path },
  // Hosting
  { id: 'netlify',       label: 'Netlify',          category: 'Hosting',        brandColor: `#${siNetlify.hex}`,        iconPath: siNetlify.path },
  { id: 'vercel',        label: 'Vercel',           category: 'Hosting',        brandColor: `#${siVercel.hex}`,         iconPath: siVercel.path },
  { id: 'cloudflare',    label: 'Cloudflare',       category: 'Hosting',        brandColor: `#${siCloudflare.hex}`,     iconPath: siCloudflare.path },
  { id: 'render',        label: 'Render',           category: 'Hosting',        brandColor: `#${siRender.hex}`,         iconPath: siRender.path },
  { id: 'railway',       label: 'Railway',          category: 'Hosting',        brandColor: `#${siRailway.hex}`,        iconPath: siRailway.path },
  { id: 'digitalocean',  label: 'DigitalOcean',     category: 'Hosting',        brandColor: `#${siDigitalocean.hex}`,   iconPath: siDigitalocean.path },
  { id: 'flydotio',      label: 'Fly.io',           category: 'Hosting',        brandColor: `#${siFlydotio.hex}`,       iconPath: siFlydotio.path },
  { id: 'vultr',         label: 'Vultr',            category: 'Hosting',        brandColor: `#${siVultr.hex}`,          iconPath: siVultr.path },
  // Infrastructure
  { id: 'docker',        label: 'Docker',           category: 'Infrastructure', brandColor: `#${siDocker.hex}`,         iconPath: siDocker.path },
  { id: 'kubernetes',    label: 'Kubernetes',       category: 'Infrastructure', brandColor: `#${siKubernetes.hex}`,     iconPath: siKubernetes.path },
  { id: 'nginx',         label: 'Nginx',            category: 'Infrastructure', brandColor: `#${siNginx.hex}`,          iconPath: siNginx.path },
  // Auth
  { id: 'auth0',         label: 'Auth0',            category: 'Auth',           brandColor: `#${siAuth0.hex}`,          iconPath: siAuth0.path },
  { id: 'clerk',         label: 'Clerk',            category: 'Auth',           brandColor: `#${siClerk.hex}`,          iconPath: siClerk.path },
  { id: 'okta',          label: 'Okta',             category: 'Auth',           brandColor: `#${siOkta.hex}`,           iconPath: siOkta.path },
  { id: 'keycloak',      label: 'Keycloak',         category: 'Auth',           brandColor: `#${siKeycloak.hex}`,       iconPath: siKeycloak.path },
  // Cloud
  { id: 'googlecloud',   label: 'Google Cloud',     category: 'Cloud',          brandColor: `#${siGooglecloud.hex}`,    iconPath: siGooglecloud.path },
  { id: 'exoscale',      label: 'Exoscale',         category: 'Cloud',          brandColor: `#${siExoscale.hex}`,       iconPath: siExoscale.path },
  // Backend
  { id: 'appwrite',      label: 'Appwrite',         category: 'Backend',        brandColor: `#${siAppwrite.hex}`,       iconPath: siAppwrite.path },
  // Payments
  { id: 'stripe',        label: 'Stripe',           category: 'Payments',       brandColor: `#${siStripe.hex}`,         iconPath: siStripe.path },
  // Monitoring
  { id: 'sentry',        label: 'Sentry',           category: 'Monitoring',     brandColor: `#${siSentry.hex}`,         iconPath: siSentry.path },
  { id: 'datadog',       label: 'Datadog',          category: 'Monitoring',     brandColor: `#${siDatadog.hex}`,        iconPath: siDatadog.path },
  { id: 'grafana',       label: 'Grafana',          category: 'Monitoring',     brandColor: `#${siGrafana.hex}`,        iconPath: siGrafana.path },
  { id: 'newrelic',      label: 'New Relic',        category: 'Monitoring',     brandColor: `#${siNewrelic.hex}`,       iconPath: siNewrelic.path },
  { id: 'prometheus',    label: 'Prometheus',       category: 'Monitoring',     brandColor: `#${siPrometheus.hex}`,     iconPath: siPrometheus.path },
  // CI/CD
  { id: 'githubactions', label: 'GitHub Actions',   category: 'CI/CD',          brandColor: `#${siGithubactions.hex}`,  iconPath: siGithubactions.path },
  { id: 'circleci',      label: 'CircleCI',         category: 'CI/CD',          brandColor: `#${siCircleci.hex}`,       iconPath: siCircleci.path },
  { id: 'gitlab',        label: 'GitLab',           category: 'CI/CD',          brandColor: `#${siGitlab.hex}`,         iconPath: siGitlab.path },
  { id: 'jenkins',       label: 'Jenkins',          category: 'CI/CD',          brandColor: `#${siJenkins.hex}`,        iconPath: siJenkins.path },
  { id: 'travisci',      label: 'Travis CI',        category: 'CI/CD',          brandColor: `#${siTravisci.hex}`,       iconPath: siTravisci.path },
  { id: 'bitbucket',     label: 'Bitbucket',        category: 'CI/CD',          brandColor: `#${siBitbucket.hex}`,      iconPath: siBitbucket.path },
  // Messaging
  { id: 'apachekafka',   label: 'Apache Kafka',     category: 'Messaging',      brandColor: `#${siApachekafka.hex}`,    iconPath: siApachekafka.path },
  { id: 'resend',        label: 'Resend',           category: 'Messaging',      brandColor: `#${siResend.hex}`,         iconPath: siResend.path },
  // CMS
  { id: 'contentful',    label: 'Contentful',       category: 'CMS',            brandColor: `#${siContentful.hex}`,     iconPath: siContentful.path },
  { id: 'strapi',        label: 'Strapi',           category: 'CMS',            brandColor: `#${siStrapi.hex}`,         iconPath: siStrapi.path },
  { id: 'sanity',        label: 'Sanity',           category: 'CMS',            brandColor: `#${siSanity.hex}`,         iconPath: siSanity.path },
  { id: 'wordpress',     label: 'WordPress',        category: 'CMS',            brandColor: `#${siWordpress.hex}`,      iconPath: siWordpress.path },
  { id: 'ghost',         label: 'Ghost',            category: 'CMS',            brandColor: `#${siGhost.hex}`,          iconPath: siGhost.path },
  // CDN / Media
  { id: 'cloudinary',    label: 'Cloudinary',       category: 'CDN',            brandColor: `#${siCloudinary.hex}`,     iconPath: siCloudinary.path },
  { id: 'fastly',        label: 'Fastly',           category: 'CDN',            brandColor: `#${siFastly.hex}`,         iconPath: siFastly.path },
  // Search
  { id: 'algolia',       label: 'Algolia',          category: 'Search',         brandColor: `#${siAlgolia.hex}`,        iconPath: siAlgolia.path },
  // Analytics
  { id: 'posthog',       label: 'PostHog',          category: 'Analytics',      brandColor: `#${siPosthog.hex}`,        iconPath: siPosthog.path },
  { id: 'mixpanel',      label: 'Mixpanel',         category: 'Analytics',      brandColor: `#${siMixpanel.hex}`,       iconPath: siMixpanel.path },
  // Cloud (logos)
  { id: 'aws',           label: 'AWS',              category: 'Cloud',          brandColor: '#FF9900',
    iconBody: String.raw`<path fill="#252f3e" d="M72.392 55.438c0 3.137.34 5.68.933 7.545a45.4 45.4 0 0 0 2.712 6.103c.424.678.593 1.356.593 1.95c0 .847-.508 1.695-1.61 2.543l-5.34 3.56c-.763.509-1.526.763-2.205.763c-.847 0-1.695-.424-2.543-1.187a26 26 0 0 1-3.051-3.984c-.848-1.44-1.696-3.052-2.628-5.001q-9.919 11.697-24.922 11.698c-7.12 0-12.8-2.035-16.954-6.103c-4.153-4.07-6.272-9.495-6.272-16.276c0-7.205 2.543-13.054 7.714-17.462c5.17-4.408 12.037-6.612 20.768-6.612c2.882 0 5.849.254 8.985.678c3.137.424 6.358 1.102 9.749 1.865V29.33c0-6.443-1.357-10.935-3.985-13.563c-2.712-2.628-7.29-3.9-13.817-3.9c-2.967 0-6.018.34-9.155 1.103s-6.188 1.695-9.155 2.882c-1.356.593-2.373.932-2.967 1.102s-1.017.254-1.356.254c-1.187 0-1.78-.848-1.78-2.628v-4.154c0-1.356.17-2.373.593-2.966c.424-.594 1.187-1.187 2.374-1.78q4.45-2.29 10.68-3.815C33.908.763 38.316.255 42.978.255c10.088 0 17.463 2.288 22.21 6.866c4.662 4.577 7.036 11.528 7.036 20.853v27.464zM37.976 68.323c2.798 0 5.68-.508 8.731-1.526c3.052-1.017 5.765-2.882 8.053-5.425c1.357-1.61 2.374-3.39 2.882-5.425c.509-2.034.848-4.493.848-7.375v-3.56a71 71 0 0 0-7.799-1.441a64 64 0 0 0-7.968-.509c-5.68 0-9.833 1.102-12.63 3.391s-4.154 5.51-4.154 9.748c0 3.984 1.017 6.951 3.136 8.986c2.035 2.119 5.002 3.136 8.901 3.136m68.069 9.155c-1.526 0-2.543-.254-3.221-.848c-.678-.508-1.272-1.695-1.78-3.305L81.124 7.799c-.51-1.696-.764-2.798-.764-3.391c0-1.356.678-2.12 2.035-2.12h8.307c1.61 0 2.713.255 3.306.848c.678.509 1.187 1.696 1.695 3.306l14.241 56.117l13.224-56.117c.424-1.695.933-2.797 1.61-3.306c.679-.508 1.866-.847 3.392-.847h6.781c1.61 0 2.713.254 3.39.847c.679.509 1.272 1.696 1.611 3.306l13.394 56.795L168.01 6.442c.508-1.695 1.102-2.797 1.695-3.306c.678-.508 1.78-.847 3.306-.847h7.883c1.357 0 2.12.678 2.12 2.119c0 .424-.085.848-.17 1.356s-.254 1.187-.593 2.12l-20.43 65.525q-.762 2.544-1.78 3.306c-.678.509-1.78.848-3.22.848h-7.29c-1.611 0-2.713-.254-3.392-.848c-.678-.593-1.271-1.695-1.61-3.39l-13.14-54.676l-13.054 54.59c-.423 1.696-.932 2.798-1.61 3.391c-.678.594-1.865.848-3.39.848zm108.927 2.289c-4.408 0-8.816-.509-13.054-1.526c-4.239-1.017-7.544-2.12-9.748-3.39c-1.357-.764-2.29-1.611-2.628-2.374a6 6 0 0 1-.509-2.374V65.78c0-1.78.678-2.628 1.95-2.628a4.8 4.8 0 0 1 1.526.255c.508.17 1.271.508 2.119.847a46 46 0 0 0 9.324 2.967a51 51 0 0 0 10.088 1.017c5.34 0 9.494-.932 12.376-2.797s4.408-4.577 4.408-8.053c0-2.373-.763-4.323-2.289-5.934s-4.408-3.051-8.561-4.408l-12.292-3.814c-6.188-1.95-10.765-4.832-13.563-8.647c-2.797-3.73-4.238-7.883-4.238-12.291q0-5.34 2.289-9.41c1.525-2.712 3.56-5.085 6.103-6.95c2.543-1.95 5.425-3.391 8.816-4.408c3.39-1.017 6.95-1.441 10.68-1.441c1.865 0 3.815.085 5.68.339c1.95.254 3.73.593 5.51.932c1.695.424 3.306.848 4.832 1.357q2.288.762 3.56 1.525c1.187.679 2.034 1.357 2.543 2.12q.763 1.017.763 2.797v3.984c0 1.78-.678 2.713-1.95 2.713c-.678 0-1.78-.34-3.22-1.018q-7.25-3.306-16.276-3.306c-4.832 0-8.647.763-11.275 2.374c-2.627 1.61-3.984 4.069-3.984 7.544c0 2.374.848 4.408 2.543 6.019s4.832 3.221 9.325 4.662l12.037 3.815c6.103 1.95 10.511 4.662 13.139 8.137s3.9 7.46 3.9 11.868c0 3.645-.764 6.951-2.205 9.833c-1.525 2.882-3.56 5.425-6.188 7.46c-2.628 2.119-5.764 3.645-9.409 4.747c-3.815 1.187-7.799 1.78-12.122 1.78"/><path fill="#f90" d="M230.993 120.964c-27.888 20.599-68.408 31.534-103.247 31.534c-48.827 0-92.821-18.056-126.05-48.064c-2.628-2.373-.255-5.594 2.881-3.73c35.942 20.854 80.276 33.484 126.136 33.484c30.94 0 64.932-6.442 96.212-19.666c4.662-2.12 8.646 3.052 4.068 6.442m11.614-13.224c-3.56-4.577-23.566-2.204-32.636-1.102c-2.713.34-3.137-2.034-.678-3.814c15.936-11.19 42.13-7.968 45.181-4.239c3.052 3.815-.848 30.008-15.767 42.554c-2.288 1.95-4.492.933-3.475-1.61c3.39-8.393 10.935-27.296 7.375-31.789"/>`,
    iconViewBox: '0 0 256 153' },
  { id: 'azure',         label: 'Azure',            category: 'Cloud',          brandColor: '#0078D4',
    iconBody: String.raw`<defs><linearGradient id="azG1" x1="58.972%" x2="37.191%" y1="7.411%" y2="103.762%"><stop offset="0%" stop-color="#114a8b"/><stop offset="100%" stop-color="#0669bc"/></linearGradient><linearGradient id="azG2" x1="59.719%" x2="52.691%" y1="52.313%" y2="54.864%"><stop offset="0%" stop-opacity=".3"/><stop offset="7.1%" stop-opacity=".2"/><stop offset="32.1%" stop-opacity=".1"/><stop offset="62.3%" stop-opacity=".05"/><stop offset="100%" stop-opacity="0"/></linearGradient><linearGradient id="azG3" x1="37.279%" x2="62.473%" y1="4.6%" y2="99.979%"><stop offset="0%" stop-color="#3ccbf4"/><stop offset="100%" stop-color="#2892df"/></linearGradient></defs><path fill="url(#azG1)" d="M85.343.003h75.753L82.457 233a12.08 12.08 0 0 1-11.442 8.216H12.06A12.06 12.06 0 0 1 .633 225.303L73.898 8.219A12.08 12.08 0 0 1 85.343 0z"/><path fill="#0078d4" d="M195.423 156.282H75.297a5.56 5.56 0 0 0-3.796 9.627l77.19 72.047a12.14 12.14 0 0 0 8.28 3.26h68.02z"/><path fill="url(#azG2)" d="M85.343.003a11.98 11.98 0 0 0-11.471 8.376L.723 225.105a12.045 12.045 0 0 0 11.37 16.112h60.475a12.93 12.93 0 0 0 9.921-8.437l14.588-42.991l52.105 48.6a12.33 12.33 0 0 0 7.757 2.828h67.766l-29.721-84.935l-86.643.02L161.37.003z"/><path fill="url(#azG3)" d="M182.098 8.207A12.06 12.06 0 0 0 170.67.003H86.245c5.175 0 9.773 3.301 11.428 8.204L170.94 225.3a12.062 12.062 0 0 1-11.428 15.92h84.429a12.062 12.062 0 0 0 11.425-15.92z"/>`,
    iconViewBox: '0 0 256 242' },
  // Hosting (logos)
  { id: 'heroku',        label: 'Heroku',           category: 'Hosting',        brandColor: '#430098',
    iconBody: String.raw`<path fill="#430098" d="M116.494 0c7.045 0 12.776 5.627 12.94 12.634l.004.31v117.932c0 7.045-5.629 12.776-12.634 12.94l-.31.004H12.944c-7.044 0-12.776-5.629-12.94-12.634l-.004-.31V12.944C0 5.898 5.63.168 12.634.004l.31-.004zm0 7.191H12.944a5.76 5.76 0 0 0-5.749 5.533l-.004.22v117.932a5.76 5.76 0 0 0 5.533 5.749l.22.004h103.55a5.76 5.76 0 0 0 5.749-5.532l.004-.22V12.943a5.76 5.76 0 0 0-5.753-5.753M32.36 93.483l16.18 14.382l-16.18 14.382zm14.382-71.91v40.829c7.18-2.337 17.217-4.874 26.966-4.874c8.89 0 14.211 3.495 17.11 6.427c6.091 6.163 6.266 13.988 6.26 15.1l-.001.046l.002 43.146H82.697V79.3c-.07-3.357-1.688-7.389-8.99-7.389c-14.476 0-30.697 7.208-31.179 7.424l-.01.004l-10.158 4.603V21.573zm50.337 0c-.971 8.169-4.283 16-10.787 23.37H71.91c5.652-7.415 9.201-15.219 10.787-23.37Zm268.016 24.248c12.76 0 26.022 8.104 26.022 27.527c0 19.427-13.262 27.528-26.022 27.528c-12.833 0-26.093-8.101-26.093-27.528c0-19.423 13.26-27.527 26.093-27.527m116.724 1.005v31.687c0 7.308 2.366 10.607 8.103 10.607c5.733 0 8.027-3.299 8.027-10.607V46.826H512v31.757c0 14.053-6.738 22.079-22.222 22.079c-15.486 0-22.296-8.026-22.296-22.079V46.826zm-305.684 0v19.712h17.634V46.826h14.339v53.048h-14.339V78.44h-17.634v21.434h-14.337V46.826zm88.29 0v11.901H240.91v8.602h16.775v11.184H240.91v9.82h24.734v11.541h-39.07V46.826zm37.684 0c13.62 0 21.936 4.518 21.936 17.276c0 8.315-3.515 13.12-10.467 15.483l11.254 20.29h-15.196l-10.253-18.422h-3.942v18.421h-14.05V46.826zm119.304 0V66.04l14.627-19.214h16.629l-17.85 20.933l19.426 32.115h-16.201l-12.543-21.22l-4.088 4.731v16.49h-14.335v-53.05zM365.095 57.65c-7.527 0-11.756 5.95-11.756 15.698c0 9.753 4.229 16.06 11.756 16.06c7.455 0 11.683-6.307 11.683-16.06c0-9.749-4.228-15.698-11.683-15.698m-63.49.788h-6.164v12.115h6.164c5.879 0 8.459-1.649 8.459-6.093c0-4.442-2.58-6.022-8.459-6.022"/>`,
    iconViewBox: '0 0 512 144' },
  // Messaging (logos)
  { id: 'twilio',        label: 'Twilio',           category: 'Messaging',      brandColor: '#F22F46',
    iconBody: String.raw`<path fill="#f12e45" d="M77.016 0c42.512 0 77.015 34.503 77.015 77.016c0 42.512-34.503 77.015-77.015 77.015S0 119.528 0 77.016S34.503 0 77.016 0m0 20.332c-31.423 0-56.684 25.261-56.684 56.684s25.261 56.683 56.684 56.683s56.683-25.261 56.683-56.683s-25.261-56.684-56.683-56.684m395.86 31.73c22.797 0 39.124 16.636 39.124 36.352v.308c0 19.716-16.327 36.66-39.432 36.66c-22.797 0-39.124-16.636-39.124-36.352v-.308c0-19.716 16.327-36.66 39.432-36.66M207.634 30.499c.924-.308 1.849.616 1.849 1.232v22.181h40.972c.924 0 1.54.616 1.848 1.232l3.389 12.63l3.08 12.631l.309.616l.308-1.232l7.701-25.569c.308-.616 1.233-1.232 1.849-1.232h20.332c.924 0 1.54.616 1.848 1.232l8.01 27.418l.308-1.233l6.777-25.569c.308-.616 1.232-1.232 1.849-1.232h52.37c.616 0 1.232.616 1.232 1.54v67.158c0 .616-.616 1.232-1.232 1.232h-26.185c-.616 0-1.232-.616-1.232-1.232V57.608L313.3 122.3c-.308.616-1.233 1.232-1.849 1.232h-21.564c-.924 0-1.54-.616-1.848-1.232l-4.313-13.555l-4.621-14.787l-9.242 28.65c-.308.616-1.232 1.232-1.849 1.232H246.45c-.924 0-1.54-.616-1.848-1.232l-19.408-64.385v16.635c0 .616-.616 1.232-1.233 1.232h-14.787v17.56c0 5.237 2.465 7.085 7.086 7.085c2.464 0 4.62-.308 7.393-1.54c.617 0 1.54.308 1.54 1.232v20.333c-4.62 2.464-11.398 4.004-18.483 4.004c-16.943 0-26.185-8.01-26.185-24.953V75.783h-6.778c-.616 0-1.232-.616-1.232-1.232V54.835c0-.616.616-1.232 1.232-1.232h6.778V39.74c0-.616.308-.924 1.232-1.232Zm187.302-.308c.616 0 1.232.616 1.232 1.232v90.879c0 .616-.616 1.232-1.232 1.232h-26.185c-.616 0-1.232-.616-1.232-1.232v-90.88c0-.616.616-1.232 1.232-1.232Zm34.503 23.413c.616 0 1.232.616 1.232 1.54v67.158c0 .616-.616 1.232-1.232 1.232h-26.185c-.616 0-1.232-.616-1.232-1.232V54.835c0-.616.616-1.232 1.232-1.232ZM96.116 80.096c8.847 0 16.019 7.172 16.019 16.02s-7.172 16.019-16.02 16.019s-16.019-7.172-16.019-16.02s7.172-16.019 16.02-16.019m-38.2 0c8.847 0 16.019 7.172 16.019 16.02s-7.172 16.019-16.02 16.019c-8.846 0-16.018-7.172-16.018-16.02s7.172-16.019 16.019-16.019m414.652-4.005c-6.47 0-11.09 5.238-11.09 12.015v.308c0 6.777 4.929 12.322 11.398 12.322c6.47 0 11.09-5.237 11.09-12.014c0-7.085-4.929-12.63-11.398-12.63M96.116 41.897c8.847 0 16.019 7.172 16.019 16.019s-7.172 16.019-16.02 16.019s-16.019-7.172-16.019-16.02c0-8.846 7.172-16.018 16.02-16.018m-38.2 0c8.847 0 16.019 7.172 16.019 16.019s-7.172 16.019-16.02 16.019c-8.846 0-16.018-7.172-16.018-16.02c0-8.846 7.172-16.018 16.019-16.018M360.74 30.19c.924 0 1.54.616 1.233 1.232v15.712c0 .616-.617 1.232-1.233 1.232h-27.11c-.615 0-1.231-.616-1.231-1.232V31.422c0-.616.616-1.232 1.232-1.232Zm69.006 0c.924 0 1.54.616 1.233 1.232v15.712c0 .616-.617 1.232-1.233 1.232h-27.11c-.615 0-1.231-.616-1.231-1.232V31.422c0-.616.616-1.232 1.232-1.232Z"/>`,
    iconViewBox: '0 0 512 155' },
  // AWS services (logos)
  { id: 'aws-s3',        label: 'AWS S3',           category: 'Cloud',          brandColor: '#3F8624',
    iconBody: String.raw`<defs><linearGradient id="s3G" x1="0%" x2="100%" y1="100%" y2="0%"><stop offset="0%" stop-color="#1b660f"/><stop offset="100%" stop-color="#6cae3e"/></linearGradient></defs><path fill="url(#s3G)" d="M0 0h256v256H0z"/><path fill="#fff" d="m194.675 137.256l1.229-8.652c11.33 6.787 11.478 9.59 11.475 9.667c-.02.016-1.952 1.629-12.704-1.015m-6.218-1.728c-19.584-5.926-46.857-18.438-57.894-23.654c0-.045.013-.086.013-.131c0-4.24-3.45-7.69-7.693-7.69c-4.237 0-7.687 3.45-7.687 7.69s3.45 7.69 7.687 7.69c1.862 0 3.552-.695 4.886-1.8c12.986 6.148 40.048 18.478 59.776 24.302l-7.801 55.059q-.033.225-.032.451c0 4.848-21.463 13.754-56.532 13.754c-35.44 0-57.13-8.906-57.13-13.754q0-.22-.028-.435l-16.3-119.062c14.108 9.712 44.454 14.85 73.478 14.85c28.979 0 59.273-5.12 73.41-14.802zM48 65.528c.23-4.21 24.428-20.73 75.2-20.73c50.764 0 74.966 16.516 75.2 20.73v1.437c-2.784 9.443-34.144 19.434-75.2 19.434c-41.127 0-72.503-10.023-75.2-19.479zm156.8.07c0-11.087-31.79-27.2-81.6-27.2c-49.812 0-81.6 16.113-81.6 27.2l.3 2.414l17.754 129.676c.426 14.503 39.1 19.91 63.526 19.91c30.31 0 62.512-6.969 62.928-19.9l7.668-54.07c4.265 1.02 7.776 1.542 10.595 1.542c3.785 0 6.345-.925 7.897-2.774c1.274-1.517 1.76-3.354 1.396-5.31c-.83-4.428-6.087-9.202-16.794-15.311l7.603-53.639z"/>`,
    iconViewBox: '0 0 256 256' },
  { id: 'aws-lambda',    label: 'AWS Lambda',       category: 'Cloud',          brandColor: '#E07515',
    iconBody: String.raw`<defs><linearGradient id="lamG" x1="0%" x2="100%" y1="100%" y2="0%"><stop offset="0%" stop-color="#c8511b"/><stop offset="100%" stop-color="#f90"/></linearGradient></defs><path fill="url(#lamG)" d="M0 0h256v256H0z"/><path fill="#fff" d="M89.624 211.2H49.89l43.945-91.853l19.912 40.992zm7.079-100.63a3.22 3.22 0 0 0-2.887-1.805h-.01a3.2 3.2 0 0 0-2.886 1.82L41.913 213.022a3.203 3.203 0 0 0 2.893 4.58l46.848-.001a3.21 3.21 0 0 0 2.9-1.83l25.65-54.08a3.18 3.18 0 0 0-.016-2.762zM207.985 211.2h-39.477L105.174 78.624a3.21 3.21 0 0 0-2.897-1.824h-25.83l.03-32h50.626l63.042 132.573a3.21 3.21 0 0 0 2.897 1.827h14.943zm3.208-38.4h-16.121L132.03 40.227a3.21 3.21 0 0 0-2.9-1.827H73.273a3.206 3.206 0 0 0-3.208 3.197l-.035 38.4c0 .851.333 1.664.94 2.265c.6.602 1.414.938 2.267.938h27.017l63.337 132.576a3.2 3.2 0 0 0 2.893 1.824h44.709a3.203 3.203 0 0 0 3.207-3.2V176c0-1.766-1.434-3.2-3.207-3.2"/>`,
    iconViewBox: '0 0 256 256' },
  { id: 'aws-ec2',       label: 'AWS EC2',          category: 'Cloud',          brandColor: '#E07515',
    iconBody: String.raw`<defs><linearGradient id="ec2G" x1="0%" x2="100%" y1="100%" y2="0%"><stop offset="0%" stop-color="#c8511b"/><stop offset="100%" stop-color="#f90"/></linearGradient></defs><path fill="url(#ec2G)" d="M0 0h256v256H0z"/><path fill="#fff" d="M86.4 169.6h80v-80h-80zm86.4-80h12.8V96h-12.8v12.8h12.8v6.4h-12.8v9.6h12.8v6.4h-12.8V144h12.8v6.4h-12.8v12.8h12.8v6.4h-12.8v.435a5.97 5.97 0 0 1-5.965 5.965h-.435v12.8H160V176h-12.8v12.8h-6.4V176h-9.6v12.8h-6.4V176H112v12.8h-6.4V176H92.8v12.8h-6.4V176h-.435A5.97 5.97 0 0 1 80 170.035v-.435h-9.6v-6.4H80v-12.8h-9.6V144H80v-12.8h-9.6v-6.4H80v-9.6h-9.6v-6.4H80V96h-9.6v-6.4H80v-.435a5.97 5.97 0 0 1 5.965-5.965h.435V70.4h6.4v12.8h12.8V70.4h6.4v12.8h12.8V70.4h6.4v12.8h9.6V70.4h6.4v12.8H160V70.4h6.4v12.8h.435a5.97 5.97 0 0 1 5.965 5.965zm-41.6 121.203a.4.4 0 0 1-.397.397H45.197a.4.4 0 0 1-.397-.397v-85.606a.4.4 0 0 1 .397-.397H64v-6.4H45.197a6.805 6.805 0 0 0-6.797 6.797v85.606a6.805 6.805 0 0 0 6.797 6.797h85.606a6.805 6.805 0 0 0 6.797-6.797V195.2h-6.4zm86.4-165.606v85.606a6.805 6.805 0 0 1-6.797 6.797H192v-6.4h18.803a.4.4 0 0 0 .397-.397V45.197a.4.4 0 0 0-.397-.397h-85.606a.4.4 0 0 0-.397.397V64h-6.4V45.197a6.805 6.805 0 0 1 6.797-6.797h85.606a6.805 6.805 0 0 1 6.797 6.797"/>`,
    iconViewBox: '0 0 256 256' },
  { id: 'aws-rds',       label: 'AWS RDS',          category: 'Database',       brandColor: '#3F48CC',
    iconBody: String.raw`<defs><linearGradient id="rdsG" x1="0%" x2="100%" y1="100%" y2="0%"><stop offset="0%" stop-color="#2e27ad"/><stop offset="100%" stop-color="#527fff"/></linearGradient></defs><path fill="url(#rdsG)" d="M0 0h256v256H0z"/><path fill="#fff" d="m49.325 44.8l29.737 29.738l-4.524 4.524L44.8 49.325V73.6h-6.4v-32a3.2 3.2 0 0 1 3.2-3.2h32v6.4zM217.6 41.6v32h-6.4V49.325l-29.738 29.737l-4.524-4.524L206.675 44.8H182.4v-6.4h32a3.2 3.2 0 0 1 3.2 3.2m-6.4 140.8h6.4v32a3.2 3.2 0 0 1-3.2 3.2h-32v-6.4h24.275l-29.737-29.738l4.524-4.524l29.738 29.737zm-1.6-56.918c0-10.621-12.262-21.114-32.8-28.068l2.051-6.06C202.458 99.344 216 111.782 216 125.482c0 13.702-13.542 26.144-37.152 34.13l-2.051-6.063c20.54-6.95 32.803-17.44 32.803-28.067m-163.02 0c0 10.176 11.478 20.39 30.706 27.328l-2.172 6.019c-22.202-8.01-34.935-20.163-34.935-33.347c0-13.181 12.733-25.335 34.935-33.348l2.172 6.02c-19.228 6.94-30.707 17.155-30.707 27.328m32.482 55.98L49.325 211.2H73.6v6.4h-32a3.2 3.2 0 0 1-3.2-3.2v-32h6.4v24.275l29.738-29.737zM128 100.115c-22.867 0-35.2-5.907-35.2-8.32c0-2.416 12.333-8.32 35.2-8.32c22.864 0 35.2 5.904 35.2 8.32c0 2.413-12.336 8.32-35.2 8.32m.093 24.784c-21.895 0-35.293-5.98-35.293-9.235v-15.555c7.882 4.349 21.862 6.406 35.2 6.406s27.318-2.057 35.2-6.406v15.555c0 3.258-13.328 9.235-35.107 9.235m0 24.435c-21.895 0-35.293-5.98-35.293-9.235v-15.74c7.78 4.572 21.574 6.94 35.293 6.94c13.641 0 27.357-2.365 35.107-6.925V140.1c0 3.258-13.328 9.235-35.107 9.235M128 171.258c-22.774 0-35.2-6.122-35.2-9.268v-13.196c7.78 4.572 21.574 6.94 35.293 6.94c13.641 0 27.357-2.361 35.107-6.924v13.18c0 3.146-12.426 9.268-35.2 9.268m0-94.183c-20.035 0-41.6 4.605-41.6 14.72v70.195c0 10.285 20.928 15.668 41.6 15.668s41.6-5.383 41.6-15.668V91.795c0-10.115-21.565-14.72-41.6-14.72"/>`,
    iconViewBox: '0 0 256 256' },
  { id: 'aws-dynamodb',  label: 'AWS DynamoDB',     category: 'Database',       brandColor: '#3F48CC',
    iconBody: String.raw`<defs><linearGradient id="dynG" x1="0%" x2="100%" y1="100%" y2="0%"><stop offset="0%" stop-color="#2e27ad"/><stop offset="100%" stop-color="#527fff"/></linearGradient></defs><path fill="url(#dynG)" d="M0 0h256v256H0z"/><path fill="#fff" d="M166.675 175.52c-10.682 8.637-33.091 13.2-54.534 13.2c-21.447 0-43.863-4.566-54.541-13.202v17.392h.003c0 8.675 22.397 18.342 54.538 18.342c32.115 0 54.499-9.655 54.534-18.323zm.003-33.049l6.4-.035v.035c0 3.866-1.936 7.475-5.705 10.779c4.57 4.021 5.705 7.966 5.705 10.775c0 .02-.003.035-.003.054v28.831h.003c0 16.035-31.398 24.69-60.937 24.69c-29.469 0-60.781-8.617-60.931-24.578c0-.016-.01-.032-.01-.048v-28.958c0-.007.006-.016.006-.026c.01-2.809 1.15-6.738 5.712-10.75c-4.534-4.005-5.686-7.912-5.715-10.699h.003c0-.013-.006-.022-.006-.035v-28.958c0-.01.006-.02.006-.029c.01-2.809 1.152-6.738 5.716-10.743c-4.538-4.009-5.69-7.92-5.719-10.703h.003c0-.012-.006-.025-.006-.038V63.08c0-.01.006-.019.006-.029C51.261 47.04 82.624 38.4 112.141 38.4c16.675 0 32.694 2.65 43.948 7.271l-2.448 5.866c-10.505-4.314-25.632-6.79-41.5-6.79c-32.141 0-54.538 9.668-54.538 18.349c0 8.677 22.397 18.345 54.538 18.345c.867.01 1.715 0 2.573-.032l.268 6.342c-.947.038-1.894.038-2.841.038c-21.447 0-43.863-4.568-54.541-13.204V91.97h.003v.073c.032 3.329 3.447 6.236 6.307 8.083c8.608 5.488 24.032 9.236 41.232 10.014l-.29 6.341c-17.425-.79-32.682-4.405-42.503-9.946c-2.42 1.809-4.746 4.256-4.746 7.03c0 8.677 22.397 18.345 54.538 18.345c3.152 0 6.281-.105 9.305-.315l.445 6.332c-3.168.22-6.451.33-9.75.33c-21.447 0-43.863-4.567-54.541-13.203v17.383h.003c.032 3.403 3.447 6.307 6.307 8.157c9.844 6.281 28.327 10.192 48.23 10.192h1.409v6.347h-1.408c-20.221 0-38.599-3.754-49.837-10.099c-2.406 1.806-4.7 4.24-4.7 6.992c0 8.677 22.396 18.348 54.537 18.348c32.115 0 54.499-9.655 54.534-18.326v-.035c-.006-2.758-2.31-5.192-4.723-6.998a45 45 0 0 1-5.14 2.523l-2.45-5.865c2.323-.955 4.339-1.987 5.993-3.072c2.886-1.883 6.323-4.825 6.323-8.129m27.411-46.418h-17.932c-1.06 0-2.055-.52-2.647-1.39a3.14 3.14 0 0 1-.33-2.951l10.91-27.27h-41.31l-19.2 38.086h20.423c1.02 0 1.98.486 2.586 1.301c.598.82.774 1.87.464 2.838l-18.228 56.818zm9.821-.974l-79.996 82.648a3.22 3.22 0 0 1-2.31.974a3.2 3.2 0 0 1-1.636-.444a3.16 3.16 0 0 1-1.414-3.692l21.075-65.69h-21.226a3.21 3.21 0 0 1-2.723-1.504a3.15 3.15 0 0 1-.138-3.088l22.4-44.434a3.2 3.2 0 0 1 2.861-1.755h48a3.21 3.21 0 0 1 2.646 1.39a3.15 3.15 0 0 1 .33 2.955L180.87 89.706h20.73c1.28 0 2.441.761 2.944 1.93a3.16 3.16 0 0 1-.634 3.443M62.256 194.158c4.534 2.555 10.243 4.703 16.966 6.38l1.562-6.158c-6.077-1.514-11.389-3.5-15.366-5.742zm16.966-44.403l1.562-6.154c-6.077-1.517-11.389-3.504-15.366-5.745l-3.162 5.52c4.534 2.555 10.24 4.704 16.966 6.38M62.256 92.594l3.162-5.52c3.97 2.241 9.286 4.225 15.366 5.745l-1.562 6.154c-6.732-1.679-12.438-3.827-16.966-6.38"/>`,
    iconViewBox: '0 0 256 256' },
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
