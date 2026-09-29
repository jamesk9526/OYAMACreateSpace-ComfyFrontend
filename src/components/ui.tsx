import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { X } from 'lucide-react';
export function Field({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {note && <span>{note}</span>}
      </span>
      {children}
    </label>
  );
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="propsection" open>
      <summary className="prophead">{title}</summary>
      <div className="props">{children}</div>
    </details>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="switchrow">
      <span>{label}</span>
      <Switch.Root className="switch" checked={checked} onCheckedChange={onChange}>
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
    </label>
  );
}
export function Modal({
  title,
  children,
  open,
  onClose,
  description,
}: {
  title: string;
  children: ReactNode;
  open: boolean;
  onClose(): void;
  description?: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">
            {description || 'Manage your CreateSpace workspace.'}
          </Dialog.Description>
          <Dialog.Close className="modal-close" aria-label="Close dialog">
            <X size={16} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
