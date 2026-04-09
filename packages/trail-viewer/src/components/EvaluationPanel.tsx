import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Rating from '@mui/material/Rating';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';

import type { TrailEvaluation } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';

interface EvaluationPanelProps {
  readonly evaluations: readonly TrailEvaluation[];
  readonly selectedSessionId?: string;
  readonly onSave: (evaluation: TrailEvaluation) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function EvaluationForm({
  selectedSessionId,
  onSave,
}: Readonly<{ selectedSessionId: string; onSave: (e: TrailEvaluation) => void }>) {
  const { colors, radius } = useTrailTheme();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [evaluator, setEvaluator] = useState('');

  const handleSubmit = useCallback(() => {
    if (score === null || !evaluator.trim()) return;

    const evaluation: TrailEvaluation = {
      id: `eval-${selectedSessionId}-${Date.now()}`,
      sessionId: selectedSessionId,
      score,
      comment: comment.trim(),
      evaluator: evaluator.trim(),
      createdAt: new Date().toISOString(),
    };
    onSave(evaluation);
    setScore(null);
    setComment('');
  }, [score, comment, evaluator, selectedSessionId, onSave]);

  const canSubmit = score !== null && evaluator.trim().length > 0;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        New Evaluation
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          Score:
        </Typography>
        <Rating
          value={score}
          onChange={(_event, newValue) => setScore(newValue)}
          size="medium"
          sx={{ '& .MuiRating-iconFilled': { color: colors.amberGold }, '& .MuiRating-iconEmpty': { color: colors.border } }}
        />
      </Box>
      <TextField
        label="Evaluator"
        value={evaluator}
        onChange={(e) => setEvaluator(e.target.value)}
        size="small"
        fullWidth
        sx={{
          mb: 1,
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: colors.border },
            '&:hover fieldset': { borderColor: colors.textSecondary },
            '&.Mui-focused fieldset': { borderColor: colors.iceBlue },
          },
          '& .MuiInputLabel-root': { color: colors.textSecondary },
          '& .MuiInputLabel-root.Mui-focused': { color: colors.iceBlue },
        }}
      />
      <TextField
        label="Comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        multiline
        minRows={2}
        maxRows={4}
        size="small"
        fullWidth
        sx={{
          mb: 1,
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: colors.border },
            '&:hover fieldset': { borderColor: colors.textSecondary },
            '&.Mui-focused fieldset': { borderColor: colors.iceBlue },
          },
          '& .MuiInputLabel-root': { color: colors.textSecondary },
          '& .MuiInputLabel-root.Mui-focused': { color: colors.iceBlue },
        }}
      />
      <Button
        variant="contained"
        size="small"
        disabled={!canSubmit}
        onClick={handleSubmit}
        sx={{ bgcolor: colors.amberGold, color: colors.textOnLight, borderRadius: radius.md, '&:hover': { bgcolor: '#d4900f' } }}
      >
        Save
      </Button>
    </Box>
  );
}

function EvaluationItem({ evaluation }: Readonly<{ evaluation: TrailEvaluation }>) {
  const { colors } = useTrailTheme();
  return (
    <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <Rating value={evaluation.score} readOnly size="small" sx={{ '& .MuiRating-iconFilled': { color: colors.amberGold }, '& .MuiRating-iconEmpty': { color: colors.border } }} />
        <Typography variant="body2" sx={{ ml: 'auto', color: colors.textSecondary }}>
          {evaluation.evaluator}
        </Typography>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          {formatDate(evaluation.createdAt)}
        </Typography>
      </Box>
      {evaluation.comment && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {evaluation.comment}
        </Typography>
      )}
    </ListItem>
  );
}

export function EvaluationPanel({
  evaluations,
  selectedSessionId,
  onSave,
}: Readonly<EvaluationPanelProps>) {
  const { colors, cardSx, radius } = useTrailTheme();
  const sessionEvaluations = selectedSessionId
    ? evaluations.filter((e) => e.sessionId === selectedSessionId)
    : [];

  return (
    <Paper
      elevation={0}
      sx={{
        ...cardSx,
        p: 2,
      }}
    >
      <Typography variant="h6" sx={{ mb: 2 }}>
        Evaluations
      </Typography>

      {selectedSessionId ? (
        <>
          <EvaluationForm
            selectedSessionId={selectedSessionId}
            onSave={onSave}
          />
          <Divider sx={{ my: 1, borderColor: colors.border }} />
          {sessionEvaluations.length > 0 ? (
            <List disablePadding>
              {sessionEvaluations.map((evalItem) => (
                <EvaluationItem key={evalItem.id} evaluation={evalItem} />
              ))}
            </List>
          ) : (
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              No evaluations yet
            </Typography>
          )}
        </>
      ) : (
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          Select a session to evaluate
        </Typography>
      )}
    </Paper>
  );
}
