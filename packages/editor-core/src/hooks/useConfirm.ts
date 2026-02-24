import { ConfirmContext } from "@/providers/ConfirmProvider";
import { DialogOptions } from "@/providers/types";
import { useContext } from "react";

const useConfirm = (): ((options: DialogOptions) => Promise<void>) => {
  const { confirm } = useContext(ConfirmContext);
  return confirm;
};

export default useConfirm;
