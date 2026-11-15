import { AlertCircle, CircleAlert, Info } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

type FeedbackAlertKind = "error" | "warning" | "information";

interface FeedbackAlertProps {
  kind: FeedbackAlertKind;
  title: string;
  message: string;
  actions?: React.ReactNode;
}

export function FeedbackAlert({
  kind,
  title,
  message,
  actions,
}: FeedbackAlertProps) {
  const Icon =
    kind === "error" ? AlertCircle : kind === "warning" ? CircleAlert : Info;

  return (
    <Alert
      variant={kind === "error" ? "destructive" : "default"}
      className={kind === "warning" ? "border-amber-400 bg-amber-50" : undefined}
    >
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {actions ? <div className="col-start-2 mt-3 flex gap-2">{actions}</div> : null}
    </Alert>
  );
}
