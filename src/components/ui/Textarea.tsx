import { cn } from "@/lib/cn";
import styles from "./Textarea.module.css";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(styles.textarea, className)} {...props} />;
}
