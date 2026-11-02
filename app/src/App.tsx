import logoLc from "./assets/logo-lc.svg";

export function App() {
  return (
    <main className="min-h-screen bg-fundo text-texto flex flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 text-center space-y-6">
        <div className="flex justify-center">
          <img
            src={logoLc}
            alt="Logo LC — Louriedna Costa Pereira"
            className="w-36 h-auto select-none"
          />
        </div>

        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-malva">LC Pacientes</h1>
          <p className="text-base text-lilas-acinzentado">
            Louriedna Costa Pereira — Psicóloga · CRP 03/29434
          </p>
        </header>

        <section
          aria-label="Paleta da identidade visual"
          className="grid grid-cols-3 gap-3 pt-2"
        >
          <div className="rounded-lg p-3 bg-malva text-white text-base font-semibold">
            Malva
          </div>
          <div className="rounded-lg p-3 bg-rosa text-texto text-base font-semibold">
            Rosa
          </div>
          <div className="rounded-lg p-3 bg-rosa-claro text-texto text-base font-semibold">
            Rosa Claro
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
