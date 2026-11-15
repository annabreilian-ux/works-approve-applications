"use client";

import { LoaderCircle, X } from "lucide-react";

import { FeedbackAlert } from "@/components/feedback-alert";
import { TextAreaField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ApprovalDialogProps {
  open: boolean;
  applicationNumber: string;
  decisionComment: string;
  fieldError?: string;
  error?: string;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onDecisionCommentChange: (value: string) => void;
  onApprove: () => void;
}

export function ApprovalDialog({
  open,
  applicationNumber,
  decisionComment,
  fieldError,
  error,
  isPending = false,
  onOpenChange,
  onDecisionCommentChange,
  onApprove,
}: ApprovalDialogProps) {
  return (
    <Dialog
      open={open}
      modal
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2"
              disabled={isPending}
            />
          }
        >
          <X aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogHeader className="pr-8">
          <DialogTitle>Approve application</DialogTitle>
          <DialogDescription>{applicationNumber}</DialogDescription>
        </DialogHeader>

        {error ? (
          <FeedbackAlert
            kind="error"
            title="Approval could not be completed"
            message={error}
          />
        ) : null}

        <TextAreaField
          id="decision-comment"
          label="Decision comment"
          required
          rows={6}
          value={decisionComment}
          maximumLength={2000}
          characterCount={decisionComment.length}
          error={fieldError}
          disabled={isPending}
          onChange={(event) => onDecisionCommentChange(event.target.value)}
        />

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>
            Cancel
          </DialogClose>
          <Button
            onClick={onApprove}
            disabled={isPending}
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            {isPending ? "Approving" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
