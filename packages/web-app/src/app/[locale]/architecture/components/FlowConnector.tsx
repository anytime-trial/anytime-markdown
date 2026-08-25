import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function FlowConnector({ label }: Readonly<{ label: string }>) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 1.25, color: 'text.secondary' }}>
      <svg
        width="18"
        height="28"
        viewBox="0 0 18 28"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M9 1v22M3 17l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}
