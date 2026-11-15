import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import styles from "./Input.module.css";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(styles.input, className)} {...props} />;
});
