// Shim del hook useToast de shadcn sobre sonner (nuestro sistema de toasts).
import { toast as sonnerToast } from "sonner";

export function toast({ title, description, variant } = {}) {
  if (variant === "destructive") return sonnerToast.error(title, { description });
  return sonnerToast(title, { description });
}

export function useToast() {
  return { toast };
}

export default useToast;
