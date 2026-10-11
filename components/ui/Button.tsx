import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "outline" | "solid" | "ghost";
type Size = "sm" | "md";

function cx(variant: Variant, size: Size, extra?: string) {
  return [styles.button, styles[variant], styles[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "outline", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(variant, size, className)} {...rest} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode };

export function ButtonLink({ variant = "outline", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={cx(variant, size, className)} {...rest} />;
}

type ButtonAnchorProps = ComponentProps<"a"> & { variant?: Variant; size?: Size };

/** A plain link styled as a button, for files and external URLs (Next's Link is for routes). */
export function ButtonAnchor({ variant = "outline", size = "md", className, ...rest }: ButtonAnchorProps) {
  return <a className={cx(variant, size, className)} {...rest} />;
}

/** Non-interactive placeholder with button geometry (e.g. a disabled pager link). */
export function ButtonPlaceholder({ children, size = "md" }: { children: ReactNode; size?: Size }) {
  return (
    <span className={cx("outline", size, styles.disabled)} aria-disabled="true">
      {children}
    </span>
  );
}
