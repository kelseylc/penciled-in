/**
 * A validation message that lives beside its field. `id` is what the input's
 * aria-describedby points at; role="alert" is what makes it announced.
 */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
