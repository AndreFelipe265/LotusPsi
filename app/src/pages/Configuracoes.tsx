export function Configuracoes() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-malva">Configurações</h2>
        <p className="text-base text-lilas-acinzentado">
          Segurança, troca de senha, cópia de segurança (backup) e preferências.
        </p>
      </div>

      <div className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-2">
        <h3 className="text-lg font-bold text-malva">Segurança e Dados</h3>
        <p className="text-base text-texto">
          Seus dados permanecem armazenados localmente e criptografados neste
          computador.
        </p>
      </div>
    </div>
  );
}
