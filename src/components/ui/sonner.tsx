import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// The app is dark-only, so toasts are too (following the OS theme gave light toasts on a dark UI).
// Styling follows docs/DESIGN.md: raised surface, hairline, the one floating shadow, rose action.
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:rounded-lg group-[.toaster]:border-rule group-[.toaster]:bg-raised group-[.toaster]:text-[13px] group-[.toaster]:text-foreground group-[.toaster]:shadow-float",
        title: "group-[.toast]:font-medium",
        description: "group-[.toast]:text-muted-foreground",
        actionButton:
          "group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:font-medium group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:rounded-md group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
