export type ToastType = "success" | "error";

export function toast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("jsmon:toast", { detail: { id: Date.now(), message, type } }),
  );
}
