export type DialogOptions = {
  open: boolean;
  alert?: boolean;
  icon?: "info" | "warn" | "alert";
  title: string;
  description: React.ReactNode;
  confirmationText?: string;
  cancellationText?: string;
};
