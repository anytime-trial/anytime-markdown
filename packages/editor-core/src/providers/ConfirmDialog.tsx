import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';

import { DialogOptions } from './types';

interface ConfirmProps extends DialogOptions {
  onSubmit: () => void;
  onClose: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmProps> = ({
  open,
  alert,
  icon,
  title,
  description,
  confirmationText,
  cancellationText,
  onSubmit,
  onClose,
  onCancel,
}) => {

  const renderIcon = () => {
    switch (icon) {
      case 'info':
        return <InfoIcon color="primary" aria-hidden="true" />;
      case 'warn':
        return <WarningIcon color="primary" aria-hidden="true" />;
      case 'alert':
        return <ErrorIcon color="error" aria-hidden="true" />;
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <DialogTitle
        id="confirm-dialog-title"
        sx={{
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {icon && renderIcon()}
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          id="confirm-dialog-description"
          sx={{
            mb: 2,
            whiteSpace: 'pre-line',
          }}
        >
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {!alert && onCancel && (
          <Button onClick={onCancel} color="primary" autoFocus>
            {cancellationText}
          </Button>
        )}
        <Button onClick={onSubmit} color="primary" autoFocus={!!alert}>
          {confirmationText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
