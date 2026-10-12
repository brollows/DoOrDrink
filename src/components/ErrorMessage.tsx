export function ErrorMessage({ message }: { message: string }) {
  return message ? <div className="error" role="alert">{message}</div> : null;
}
