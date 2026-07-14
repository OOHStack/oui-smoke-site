"use client";

import { useId, useState } from "react";

type PasswordInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
};

/** Password input with show/hide toggle. */
export function PasswordInput({
  id,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  placeholder,
  disabled,
  name,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="password-field">
      <input
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

type PasswordFieldProps = PasswordInputProps & {
  label: string;
  hint?: string;
};

/** Labeled field wrapper around PasswordInput. */
export function PasswordField({
  label,
  hint,
  id,
  ...inputProps
}: PasswordFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <PasswordInput id={inputId} {...inputProps} />
      {hint ? <p className="login-hint">{hint}</p> : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-2.2 3.1" />
      <path d="M6.1 6.1A18.4 18.4 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.4-1" />
    </svg>
  );
}
