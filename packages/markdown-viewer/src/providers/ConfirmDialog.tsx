import React from 'react';

import { Button } from '../ui/Button';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '../ui/Dialog';
import { ErrorIcon, InfoIcon, WarningIcon } from '../ui/icons';
import styles from './ConfirmDialog.module.css';
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
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-description"
    >
      <DialogTitle id="confirm-dialog-title">
        <span className={styles.titleRow}>
          {icon && renderIcon()}
          {title}
        </span>
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          id="confirm-dialog-description"
          style={{ marginBottom: 16, whiteSpace: 'pre-line' }}
        >
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {!alert && onCancel && (
          <Button onClick={onCancel} color="primary" autoFocus={!alert}>
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
