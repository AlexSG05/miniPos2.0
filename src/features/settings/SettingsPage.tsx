import { useEffect, useState, type FormEvent } from "react";
import { getBusinessSettings, saveBusinessSettings, type BusinessSettings } from "./settings.api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    void getBusinessSettings().then((value) => {
      setSettings(value);
      setBusinessName(value.businessName);
      setTaxRate((value.taxRateBasisPoints / 100).toFixed(2));
    }).catch((err) => setError(String(err))).finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const percent = Number(taxRate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100 || Math.round(percent * 100) !== percent * 100) {
      setError("La tasa debe estar entre 0 y 100%, con máximo dos decimales."); return;
    }
    setSaving(true);
    try {
      const updated = await saveBusinessSettings({ businessName: businessName.trim(), taxRateBasisPoints: Math.round(percent * 100) });
      setSettings(updated); setSuccess("Configuración guardada.");
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  const inputClass = "mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-white outline-none focus:border-sky-500";
  return <main className="min-h-full space-y-5 bg-zinc-950 p-6 text-zinc-100">
    <header><p className="text-sm text-zinc-400">Sistema / Preferencias</p><h1 className="mt-1 text-2xl font-semibold text-white">Configuración</h1><p className="mt-1 text-sm text-zinc-400">Datos locales del comercio y cálculo fiscal interno.</p></header>
    {error && <div role="alert" className="max-w-2xl rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
    {success && <div role="status" className="max-w-2xl rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{success}</div>}
    {loading ? <p className="text-sm text-zinc-400">Cargando configuración...</p> : settings && <form onSubmit={save} className="max-w-2xl space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <label className="block text-sm font-medium">Nombre del negocio<input className={inputClass} required maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
      <label className="block text-sm font-medium">Tasa fiscal adicional (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} required /><span className="mt-1 block text-xs font-normal text-zinc-500">Se calcula sobre el subtotal y se agrega al total de cada venta. La tasa se guarda en centésimas de porcentaje.</span></label>
      <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">El cálculo es una preferencia interna del punto de venta. No representa validación fiscal ni emisión de CFDI.</div>
      <div className="grid grid-cols-2 gap-4 text-sm"><div><span className="block text-zinc-500">Moneda</span>MXN · Peso mexicano</div><div><span className="block text-zinc-500">Zona comercial</span>{settings.timezone}</div></div>
      <button disabled={saving} className="rounded bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar configuración"}</button>
    </form>}
  </main>;
}
