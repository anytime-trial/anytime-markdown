import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Anytime Markdown',
  description: 'Anytime Markdown privacy policy',
};

export default function PrivacyPolicyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Privacy Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Last updated: February 28, 2026
      </Typography>

      <Section title="1. Introduction">
        <P>
          Anytime Markdown (&quot;the App&quot;) is a markdown editor application.
          This Privacy Policy explains how we handle information when you use the App.
        </P>
      </Section>

      <Section title="2. Information We Collect">
        <P>
          <strong>We do not collect personal information.</strong> The App is designed to work
          locally on your device. Your documents and settings are stored only on your device
          and are not transmitted to our servers.
        </P>
      </Section>

      <Section title="3. Data Storage">
        <P>
          All data created within the App (documents, settings, preferences) is stored locally
          on your device using browser storage or device storage. We do not have access to this data.
        </P>
      </Section>

      <Section title="4. Third-Party Services">
        <P>
          The App may connect to the following external services for specific features:
        </P>
        <Box component="ul" sx={{ pl: 3 }}>
          <li>
            <P>
              <strong>PlantUML Server</strong> - When rendering PlantUML diagrams, diagram code
              is sent to an external PlantUML rendering server. No personal information is included
              in these requests.
            </P>
          </li>
        </Box>
      </Section>

      <Section title="5. Analytics and Tracking">
        <P>
          The App does not use analytics services, tracking pixels, or advertising SDKs.
          We do not track your usage behavior.
        </P>
      </Section>

      <Section title="6. Children&apos;s Privacy">
        <P>
          The App does not knowingly collect information from children under 13. The App is a
          general-purpose text editor suitable for all ages.
        </P>
      </Section>

      <Section title="7. Changes to This Policy">
        <P>
          We may update this Privacy Policy from time to time. Changes will be reflected on this
          page with an updated revision date.
        </P>
      </Section>

      <Section title="8. Contact">
        <P>
          If you have questions about this Privacy Policy, please contact us through our{' '}
          <Link
            href="https://github.com/kiyotaka-ueda/anytime-markdown/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues
          </Link>
          .
        </P>
      </Section>

      <Box sx={{ mt: 6, pt: 3, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary" align="center">
          &copy; 2026 Anytime Markdown
        </Typography>
      </Box>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  );
}
