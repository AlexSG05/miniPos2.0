import { useState, type FormEvent } from "react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "./useAuth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, needsSetup, signIn, setupAdmin } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      if (needsSetup) await setupAdmin(username, displayName, password);
      else await signIn(username, password);
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="auth-loading">Preparando acceso local…</div>;
  if (user) return <>{children}</>;
  return <main className="auth-screen"><form className="auth-panel" onSubmit={submit}>
    <div className="auth-mark">{needsSetup ? <ShieldCheck size={23} /> : <KeyRound size={23} />}</div>
    <p className="eyebrow">MINIPOS · ACCESO LOCAL</p>
    <h1>{needsSetup ? "Crear administrador" : "Iniciar sesión"}</h1>
    <p className="auth-description">{needsSetup ? "Configura la cuenta administradora para proteger este punto de venta." : "Ingresa con tu cuenta de este equipo."}</p>
    <label>Usuario<input autoFocus minLength={3} maxLength={40} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
    {needsSetup && <label>Nombre visible<input maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>}
    <label>Contraseña<input type="password" minLength={3} maxLength={128} autoComplete={needsSetup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {needsSetup && <p className="auth-hint">Usa al menos 10 caracteres. Esta contraseña protege el acceso local.</p>}
    {error && <div role="alert" className="auth-error">{error}</div>}
    <button disabled={saving} type="submit"><LogIn size={16} />{saving ? "Validando…" : needsSetup ? "Crear cuenta" : "Entrar"}</button>
  </form></main>;
}
