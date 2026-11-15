"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FieldFrameProps {
  id: string;
  label: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  characterCount?: { current: number; maximum: number };
}

function FieldFrame({
  id,
  label,
  helpText,
  error,
  required,
  children,
  characterCount,
}: FieldFrameProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </Label>
        {characterCount ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {characterCount.current}/{characterCount.maximum}
          </span>
        ) : null}
      </div>
      {children}
      {helpText ? (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps
  extends Omit<ComponentProps<typeof Input>, "id"> {
  id: string;
  label: string;
  helpText?: string;
  error?: string;
}

export function TextField({
  id,
  label,
  helpText,
  error,
  required,
  ...props
}: TextFieldProps) {
  const describedBy = [helpText && `${id}-help`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      id={id}
      label={label}
      helpText={helpText}
      error={error}
      required={required}
    >
      <Input
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...props}
      />
    </FieldFrame>
  );
}

export interface TextAreaFieldProps
  extends Omit<ComponentProps<typeof Textarea>, "id"> {
  id: string;
  label: string;
  helpText?: string;
  error?: string;
  characterCount?: number;
  maximumLength?: number;
}

export function TextAreaField({
  id,
  label,
  helpText,
  error,
  required,
  characterCount,
  maximumLength,
  ...props
}: TextAreaFieldProps) {
  const describedBy = [helpText && `${id}-help`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      id={id}
      label={label}
      helpText={helpText}
      error={error}
      required={required}
      characterCount={
        typeof characterCount === "number" && maximumLength
          ? { current: characterCount, maximum: maximumLength }
          : undefined
      }
    >
      <Textarea
        id={id}
        required={required}
        maxLength={maximumLength}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...props}
      />
    </FieldFrame>
  );
}
