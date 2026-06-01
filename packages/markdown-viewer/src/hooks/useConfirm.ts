import { useContext } from "react";

import { ConfirmContext } from "@/providers/ConfirmProvider";
import { DialogOptions } from "@/providers/types";

const useConfirm = (): ((options: DialogOptions) => Promise<void>) => {
  const { confirm } = useContext(ConfirmContext);
  return confirm;
};

export default useConfirm;
