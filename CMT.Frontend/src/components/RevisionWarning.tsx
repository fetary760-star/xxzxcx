// components/RevisionWarning.tsx
import React from "react";

type Props = {
  show?: boolean;
  message?: string;
  className?: string;
};

export default function RevisionWarning({ show = false, message = "Revision note present", className = "" }: Props) {
  if (!show) return null;

  return (
    <div className={`revision-warning-wrapper ${className}`} title={message} aria-label="Revision notice">
      <div className="revision-warning-triangle" />
      <div className="revision-warning-blink" />
    </div>
  );
}