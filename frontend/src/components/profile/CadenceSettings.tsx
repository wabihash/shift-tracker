import type { ReactElement } from "react";

import { ShiftRulesEditor } from "./ShiftRulesEditor";

export function CadenceSettings({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null {
  return <ShiftRulesEditor open={open} onClose={onClose} />;
}
