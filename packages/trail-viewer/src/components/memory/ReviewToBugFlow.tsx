import Box from '@mui/material/Box';
import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { buildReviewFlowSteps } from './reviewFlowSteps';
import type { MemoryReviewHistoryRow } from '../../data/types';

export interface ReviewToBugFlowProps {
  readonly finding: MemoryReviewHistoryRow | null;
}

export function ReviewToBugFlow({ finding }: Readonly<ReviewToBugFlowProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();

  if (finding == null) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          {t('memory.review.empty')}
        </Typography>
      </Box>
    );
  }

  const steps = buildReviewFlowSteps(finding, {
    review: t('memory.review.flow.review'),
    findingLabel: t('memory.review.flow.finding'),
    addressed: t('memory.review.flow.addressed'),
    notAddressed: t('memory.review.flow.notAddressed'),
  });

  const activeStep = steps.filter((s) => s.completed).length;

  return (
    <Box sx={{ px: 1, py: 0.5 }}>
      <Stepper activeStep={activeStep} orientation="vertical" sx={{ '& .MuiStepLabel-label': { fontSize: '0.75rem' } }}>
        {steps.map((step) => (
          <Step key={step.label} completed={step.completed}>
            <StepLabel>
              <Typography variant="caption" sx={{ color: step.completed ? colors.textPrimary : colors.textSecondary }}>
                {step.label}
              </Typography>
            </StepLabel>
            {step.detail && (
              <StepContent>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.65rem' }}>
                  {step.detail}
                </Typography>
              </StepContent>
            )}
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
