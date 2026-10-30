import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="placeholder-page">
      <div className="eyebrow">MÓDULO EN DESARROLLO</div>
      <h1>{title}</h1>
      <div className="placeholder-panel">
        <span className="placeholder-icon"><Construction size={21} /></span>
        <div><h2>Preparado para la siguiente fase</h2><p>{description}</p></div>
      </div>
      <p className="placeholder-note">Esta pantalla no simula operaciones comerciales ni muestra cifras inventadas.</p>
    </div>
  );
}
