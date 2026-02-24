"use client";

import ConfirmDialog from './ConfirmDialog';
import { DialogOptions } from './types';
import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

export const ConfirmContext = React.createContext(
  {} as {
    confirm: (options: DialogOptions) => Promise<void>
  }
);

const DEFAULT_OPTIONS: DialogOptions = {
  open: false,
  alert: false,
  title: '',
  description: '',
  confirmationText: '',
  cancellationText: '',
};

export const ConfirmProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element => {
  const tc = useTranslations("Common");
  const [options, setOptions] = useState<DialogOptions>({ ...DEFAULT_OPTIONS });
  const [resolverFunctions, setResolverFunctions] = useState<[() => void, () => void] | []>([]);
  const [resolve, reject] = resolverFunctions;

  const confirm = useCallback((opts: DialogOptions): Promise<void> => {
    return new Promise((resolve, reject) => {
      setOptions({
        ...DEFAULT_OPTIONS,
        confirmationText: tc("ok"),
        cancellationText: tc("cancel"),
        ...opts,
        open: true,
      });
      setResolverFunctions([
        () => resolve(),
        () => reject()
      ]);
    });
  }, [tc]);

  const handleClose = useCallback(() => {
    setOptions(prevOptions => ({ ...prevOptions, open: false }));
    setResolverFunctions([]);
  }, []);

  const handleCancel = useCallback(() => {
    if (reject) {
      reject();
    }
    handleClose();
  }, [reject, handleClose]);

  const handleConfirm = useCallback(() => {
    if (resolve) {
      resolve();
    }
    handleClose();
  }, [resolve, handleClose]);

  return (
    <>
      <ConfirmContext.Provider value={{ confirm }}>
        {children}
      </ConfirmContext.Provider>
      {options.open && (
        <ConfirmDialog
          {...options}
          onSubmit={handleConfirm}
          onClose={handleClose}
          onCancel={handleCancel}
        />
      )}
    </>
  );
};

export default ConfirmProvider;
