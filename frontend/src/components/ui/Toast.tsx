import { Toaster, toast } from "sonner";

export function ToastContainer() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      richColors
      toastOptions={{
        className: "!bg-neutral-900 !border-neutral-700 !text-neutral-200",
      }}
    />
  );
}

export function toastApiError(status: number, message: string) {
  if (status === 401) {
    toast.info("Session expired. Redirecting to login...");
    setTimeout(() => {
      window.location.href = "/login";
    }, 2000);
  } else if (status >= 500) {
    toast.error(message);
  } else {
    toast.warning(message);
  }
}

export { toast };
