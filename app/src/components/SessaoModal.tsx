import React, { useEffect, useId, useRef, useState } from "react";
import { extrairErroApi, sessaoAtualizar, sessaoCriar } from "../lib/api";
import {
  aplicarMascaraDataBr,
  converterDataBrParaIso,
  formatarDataBr,
  obterDataHojeIso,
} from "../lib/format";
import type { Sessao } from "../lib/types";
import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";

export const LIMITE_CARACTERES_RESUMO = 600;

export interface SessaoModalProps {
  aberto: boolean;
  pacienteId: string;
  pacienteNome?: string;
  sessaoParaEditar?: Sessao | null;
  dataInicialIso?: string;
  aoFechar: () => void;
  aoSalva: (sessao: Sessao) => void;
  dataHojeIso?: string;
}

function limitarCaracteres(texto: string, limite: number): string {
  const chars = Array.from(texto);
  if (chars.length <= limite) return texto;
  return chars.slice(0, limite).join("");
}

export function SessaoModal({
  aberto,
  pacienteId,
  pacienteNome,
  sessaoParaEditar = null,
  dataInicialIso,
  aoFechar,
  aoSalva,
  dataHojeIso,
}: SessaoModalProps) {
  const resumoId = useId();
  const erroResumoId = useId();

  const hojeIso = dataHojeIso ?? obterDataHojeIso();
  const dataPadraoCriacaoIso = dataInicialIso ?? hojeIso;
  const modoEdicao = Boolean(sessaoParaEditar);

  const [dataBr, setDataBr] = useState<string>(() =>
    formatarDataBr(
      sessaoParaEditar ? sessaoParaEditar.data : dataPadraoCriacaoIso,
    ),
  );
  const [resumo, setResumo] = useState<string>(() =>
    sessaoParaEditar ? sessaoParaEditar.resumo : "",
  );
  const [erroData, setErroData] = useState<string | null>(null);
  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);

  const estavaAbertoRef = useRef<boolean>(false);
  const idEdicaoAnteriorRef = useRef<string | null>(null);

  useEffect(() => {
    const idEdicaoAtual = sessaoParaEditar?.id ?? null;
    const abriuAgora = aberto && !estavaAbertoRef.current;
    const trocouSessao =
      aberto && idEdicaoAtual !== idEdicaoAnteriorRef.current;

    if (abriuAgora || trocouSessao) {
      setDataBr(
        formatarDataBr(
          sessaoParaEditar
            ? sessaoParaEditar.data
            : (dataInicialIso ?? dataHojeIso ?? obterDataHojeIso()),
        ),
      );
      setResumo(sessaoParaEditar ? sessaoParaEditar.resumo : "");
      setErroData(null);
      setErroResumo(null);
      setErroGeral(null);
      setSalvando(false);
    }

    estavaAbertoRef.current = aberto;
    idEdicaoAnteriorRef.current = idEdicaoAtual;
  }, [aberto, sessaoParaEditar, dataInicialIso, dataHojeIso]);

  const totalCaracteres = Array.from(resumo).length;

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setErroData(null);
    setErroResumo(null);
    setErroGeral(null);

    if (!dataBr.trim()) {
      setErroData("A data da sessão é obrigatória.");
      return;
    }

    const dataIso = converterDataBrParaIso(dataBr);
    if (!dataIso) {
      setErroData("Data da sessão inválida. Use o formato dd/mm/aaaa.");
      return;
    }

    const limiteHojeIso = dataHojeIso ?? obterDataHojeIso();
    if (dataIso > limiteHojeIso) {
      setErroData("A data da sessão não pode ser uma data futura.");
      return;
    }

    const resumoLimpo = resumo.trim();
    if (!resumoLimpo) {
      setErroResumo("O resumo da sessão é obrigatório.");
      return;
    }

    if (Array.from(resumoLimpo).length > LIMITE_CARACTERES_RESUMO) {
      setErroResumo(
        `O resumo da sessão deve ter no máximo ${LIMITE_CARACTERES_RESUMO} caracteres.`,
      );
      return;
    }

    setSalvando(true);
    try {
      const salva =
        modoEdicao && sessaoParaEditar
          ? await sessaoAtualizar(sessaoParaEditar.id, {
              data: dataIso,
              resumo: resumoLimpo,
            })
          : await sessaoCriar({
              paciente_id: pacienteId,
              data: dataIso,
              resumo: resumoLimpo,
            });
      aoSalva(salva);
    } catch (erro) {
      setErroGeral(extrairErroApi(erro).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={modoEdicao ? "Editar sessão" : "Nova sessão"}
      aoFechar={aoFechar}
      larguraMax="lg"
      rodape={
        <>
          <Button variante="contorno" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-sessao-modal"
            variante="primario"
            disabled={salvando}
          >
            {salvando ? "Salvando..." : "Salvar sessão"}
          </Button>
        </>
      }
    >
      <form
        id="form-sessao-modal"
        onSubmit={(e) => void aoSubmeter(e)}
        noValidate
        className="space-y-4"
      >
        {pacienteNome && (
          <p className="text-base text-texto">
            Paciente: <strong>{pacienteNome}</strong>
          </p>
        )}

        {erroGeral && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rosa-claro/40 border border-malva text-base font-semibold text-texto"
          >
            {erroGeral}
          </div>
        )}

        <Input
          rotulo="Data da sessão"
          required
          value={dataBr}
          onChange={(e) => {
            setDataBr(aplicarMascaraDataBr(e.target.value));
            if (erroData) setErroData(null);
          }}
          erro={erroData}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          ajuda="Datas passadas são permitidas; datas futuras não são permitidas."
        />

        <div className="w-full space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={resumoId}
              className="block text-base font-semibold text-texto"
            >
              Resumo da sessão{" "}
              <span className="text-malva font-bold" aria-hidden="true">
                *
              </span>
            </label>
            <span
              data-testid="contador-resumo-sessao"
              className="text-base font-semibold text-lilas-acinzentado"
            >
              {totalCaracteres}/{LIMITE_CARACTERES_RESUMO}
            </span>
          </div>

          <textarea
            id={resumoId}
            rows={5}
            maxLength={LIMITE_CARACTERES_RESUMO}
            value={resumo}
            onChange={(e) => {
              setResumo(
                limitarCaracteres(e.target.value, LIMITE_CARACTERES_RESUMO),
              );
              if (erroResumo) setErroResumo(null);
            }}
            aria-invalid={Boolean(erroResumo)}
            aria-describedby={erroResumo ? erroResumoId : undefined}
            placeholder="Escreva um resumo curto do atendimento (até 5 linhas)..."
            className={`w-full px-4 py-3 text-base rounded-xl border bg-fundo-claro text-texto placeholder:text-lilas-acinzentado focus:outline-none focus:ring-2 focus:ring-malva ${
              erroResumo ? "border-[#8B2635]" : "border-lilas-acinzentado"
            }`}
          />

          {erroResumo && (
            <p
              id={erroResumoId}
              role="alert"
              className="text-base font-semibold text-[#8B2635]"
            >
              {erroResumo}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
