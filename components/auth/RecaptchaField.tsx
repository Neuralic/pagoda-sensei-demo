"use client";

import ReCAPTCHA from "react-google-recaptcha";

type Props = {
  siteKey: string;
  onChange: (token: string | null) => void;
};

export default function RecaptchaField({ siteKey, onChange }: Props) {
  return (
    <ReCAPTCHA
      sitekey={siteKey}
      theme="light"
      onChange={onChange}
      onExpired={() => onChange(null)}
    />
  );
}
