import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Input, Toast } from "../components";
import {
  extrairErroApi,
  pacienteAtualizar,
  pacienteCriar,
  pacienteObter,
} from "../lib/api";
import {
  aplicarMascaraDataBr,
  aplicarMascaraTelefone,
  calcularIdade,
  converterDataBrParaIso,
  extrairDigitos,
  formatarDataBr,
} from "../lib/format";
import type { DadosPacienteInput, ModalidadeAtendimento } from "../lib/types";

function centavosParaTextoReais(centavos?: number | null): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

function textoReaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const normalizado = limpo
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numero = Number(normalizado);
  if (Number.isNaN(numero) || numero < 0) return null;
  return Math.round(numero * 100);
}

export function PacienteForm() {
  const { id } = useParams<{ id: string }>();
  const modoEdicao = Boolean(id);
  const navigate = useNavigate();

  // Grupo 1: Dados pessoais
  const [nome, setNome] = useState("");
  const [dataNascimentoBr, setDataNascimentoBr] = useState("");
  const [documento, setDocumento] = useState("");
  const [ocupacao, setOcupacao] = useState("");

  // Grupo 2: Contato
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");

  // Grupo 3: Família/Responsável
  const [nomeMae, setNomeMae] = useState("");
  const [nomePai, setNomePai] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelParentesco, setResponsavelParentesco] = useState("");
  const [responsavelTelefone, setResponsavelTelefone] = useState("");
  const [contatoEmergenciaNome, setContatoEmergenciaNome] = useState("");
  const [contatoEmergenciaTelefone, setContatoEmergenciaTelefone] =
    useState("");

  // Grupo 4: Atendimento
  const [motivoProcura, setMotivoProcura] = useState("");
  const [modalidade, setModalidade] = useState<"" | ModalidadeAtendimento>("");
  const [convenioNome, setConvenioNome] = useState("");
  const [valorSessaoReais, setValorSessaoReais] = useState("");

  // Grupo 5: Observações
  const [observacoes, setObservacoes] = useState("");

  const [carregandoDados, setCarregandoDados] = useState<boolean>(modoEdicao);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [erroData, setErroData] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    setCarregandoDados(true);

    pacienteObter(id)
      .then((p) => {
        if (cancelado) return;
        setNome(p.nome ?? "");
        setDataNascimentoBr(
          p.data_nascimento ? formatarDataBr(p.data_nascimento) : "",
        );
        setDocumento(p.documento ?? "");
        setOcupacao(p.ocupacao ?? "");
        setTelefone(p.telefone ? aplicarMascaraTelefone(p.telefone) : "");
        setWhatsapp(p.whatsapp ? aplicarMascaraTelefone(p.whatsapp) : "");
        setEmail(p.email ?? "");
        setEndereco(p.endereco ?? "");
        setNomeMae(p.nome_mae ?? "");
        setNomePai(p.nome_pai ?? "");
        setResponsavelNome(p.responsavel_nome ?? "");
        setResponsavelParentesco(p.responsavel_parentesco ?? "");
        setResponsavelTelefone(
          p.responsavel_telefone
            ? aplicarMascaraTelefone(p.responsavel_telefone)
            : "",
        );
        setContatoEmergenciaNome(p.contato_emergencia_nome ?? "");
        setContatoEmergenciaTelefone(
          p.contato_emergencia_telefone
            ? aplicarMascaraTelefone(p.contato_emergencia_telefone)
            : "",
        );
        setMotivoProcura(p.motivo_procura ?? "");
        setModalidade((p.modalidade as ModalidadeAtendimento) ?? "");
        setConvenioNome(p.convenio_nome ?? "");
        setValorSessaoReais(centavosParaTextoReais(p.valor_sessao_centavos));
        setObservacoes(p.observacoes ?? "");
      })
      .catch((erro) => {
        if (!cancelado) {
          setErroGeral(extrairErroApi(erro).mensagem);
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregandoDados(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [id]);

  const dataIsoCalculada = useMemo(
    () => converterDataBrParaIso(dataNascimentoBr),
    [dataNascimentoBr],
  );

  const idadeCalculada = useMemo(
    () => calcularIdade(dataIsoCalculada),
    [dataIsoCalculada],
  );

  // RN13: se o paciente tiver menos de 18 anos, destaca os campos de responsável legal (sem torná-los obrigatórios)
  const menorDeIdade = idadeCalculada !== null && idadeCalculada < 18;

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setErroNome(null);
    setErroData(null);
    setErroGeral(null);

    if (!nome.trim()) {
      setErroNome("O nome completo do paciente é obrigatório.");
      return;
    }

    let dataNascimentoIso: string | null = null;
    if (dataNascimentoBr.trim() !== "") {
      dataNascimentoIso = converterDataBrParaIso(dataNascimentoBr);
      if (!dataNascimentoIso) {
        setErroData("Data de nascimento inválida. Use o formato dd/mm/aaaa.");
        return;
      }
      if (calcularIdade(dataNascimentoIso) === null) {
        setErroData("A data de nascimento não pode ser uma data futura.");
        return;
      }
    }

    const payload: DadosPacienteInput = {
      nome: nome.trim(),
      data_nascimento: dataNascimentoIso,
      telefone: extrairDigitos(telefone) || null,
      whatsapp: extrairDigitos(whatsapp) || null,
      email: email.trim() || null,
      endereco: endereco.trim() || null,
      nome_mae: nomeMae.trim() || null,
      nome_pai: nomePai.trim() || null,
      responsavel_nome: responsavelNome.trim() || null,
      responsavel_parentesco: responsavelParentesco.trim() || null,
      responsavel_telefone: extrairDigitos(responsavelTelefone) || null,
      contato_emergencia_nome: contatoEmergenciaNome.trim() || null,
      contato_emergencia_telefone:
        extrairDigitos(contatoEmergenciaTelefone) || null,
      documento: documento.trim() || null,
      ocupacao: ocupacao.trim() || null,
      motivo_procura: motivoProcura.trim() || null,
      modalidade: modalidade || null,
      convenio_nome: convenioNome.trim() || null,
      valor_sessao_centavos: textoReaisParaCentavos(valorSessaoReais),
      observacoes: observacoes.trim() || null,
    };

    setSalvando(true);
    try {
      const salvo =
        modoEdicao && id
          ? await pacienteAtualizar(id, payload)
          : await pacienteCriar(payload);
      navigate(`/pacientes/${salvo.id}`);
    } catch (erro) {
      setErroGeral(extrairErroApi(erro).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  if (carregandoDados) {
    return (
      <div className="w-full max-w-5xl mx-auto p-6 bg-fundo-claro border border-rosa-claro rounded-2xl text-base text-texto">
        Carregando dados do paciente...
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-malva">
            {modoEdicao ? "Editar Paciente" : "Cadastro de Paciente"}
          </h2>
          <p className="text-base text-lilas-acinzentado">
            Apenas o nome completo é obrigatório. Preencha os demais campos
            conforme necessário.
          </p>
        </div>
        <Button
          variante="contorno"
          onClick={() => navigate(id ? `/pacientes/${id}` : "/pacientes")}
        >
          {id ? "Voltar para o perfil" : "Voltar para pacientes"}
        </Button>
      </div>

      <form
        onSubmit={(e) => void aoSubmeter(e)}
        noValidate
        className="space-y-6"
      >
        {/* Grupo 1: Dados pessoais */}
        <section
          aria-labelledby="grupo-dados-pessoais"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3
            id="grupo-dados-pessoais"
            className="text-xl font-bold text-malva"
          >
            Dados pessoais
          </h3>

          <Input
            rotulo="Nome completo"
            required
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (erroNome) setErroNome(null);
            }}
            erro={erroNome}
            placeholder="Digite o nome completo do paciente"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              rotulo="Data de nascimento"
              value={dataNascimentoBr}
              onChange={(e) => {
                setDataNascimentoBr(aplicarMascaraDataBr(e.target.value));
                if (erroData) setErroData(null);
              }}
              erro={erroData}
              placeholder="dd/mm/aaaa"
              inputMode="numeric"
              ajuda={
                idadeCalculada !== null
                  ? `Idade: ${idadeCalculada} ${idadeCalculada === 1 ? "ano" : "anos"}`
                  : "Formato dd/mm/aaaa"
              }
            />

            <Input
              rotulo="Documento (CPF ou RG)"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Opcional"
            />

            <Input
              rotulo="Ocupação / Escola"
              value={ocupacao}
              onChange={(e) => setOcupacao(e.target.value)}
              placeholder="Profissão ou série escolar"
            />
          </div>
        </section>

        {/* Grupo 2: Contato */}
        <section
          aria-labelledby="grupo-contato"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3 id="grupo-contato" className="text-xl font-bold text-malva">
            Contato
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              rotulo="Telefone"
              value={telefone}
              onChange={(e) =>
                setTelefone(aplicarMascaraTelefone(e.target.value))
              }
              placeholder="(71) 99999-9999"
              inputMode="tel"
            />

            <Input
              rotulo="WhatsApp"
              value={whatsapp}
              onChange={(e) =>
                setWhatsapp(aplicarMascaraTelefone(e.target.value))
              }
              placeholder="(71) 99999-9999"
              inputMode="tel"
              ajuda="Se vazio, usa o telefone principal."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              rotulo="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />

            <Input
              rotulo="Endereço"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
            />
          </div>
        </section>

        {/* Grupo 3: Família/Responsável */}
        <section
          aria-labelledby="grupo-familia-responsavel"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3
            id="grupo-familia-responsavel"
            className="text-xl font-bold text-malva"
          >
            Família/Responsável
          </h3>

          {menorDeIdade && (
            <div
              data-testid="aviso-menor-idade"
              className="p-4 rounded-xl bg-rosa-claro/40 border border-malva text-base font-semibold text-texto"
            >
              Paciente menor de 18 anos ({idadeCalculada}{" "}
              {idadeCalculada === 1 ? "ano" : "anos"}) — os campos de
              responsável legal abaixo estão destacados para facilitar o
              preenchimento (opcional).
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              rotulo="Nome da mãe"
              value={nomeMae}
              onChange={(e) => setNomeMae(e.target.value)}
              placeholder="Opcional"
            />

            <Input
              rotulo="Nome do pai"
              value={nomePai}
              onChange={(e) => setNomePai(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div
            data-testid="bloco-responsavel-legal"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <Input
              rotulo="Responsável legal (nome)"
              destaque={menorDeIdade}
              value={responsavelNome}
              onChange={(e) => setResponsavelNome(e.target.value)}
              placeholder="Nome do responsável"
            />

            <Input
              rotulo="Parentesco do responsável"
              destaque={menorDeIdade}
              value={responsavelParentesco}
              onChange={(e) => setResponsavelParentesco(e.target.value)}
              placeholder="Ex.: Mãe, Pai, Avó"
            />

            <Input
              rotulo="Telefone do responsável"
              destaque={menorDeIdade}
              value={responsavelTelefone}
              onChange={(e) =>
                setResponsavelTelefone(aplicarMascaraTelefone(e.target.value))
              }
              placeholder="(71) 99999-9999"
              inputMode="tel"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              rotulo="Contato de emergência (nome)"
              value={contatoEmergenciaNome}
              onChange={(e) => setContatoEmergenciaNome(e.target.value)}
              placeholder="Pessoa para emergências"
            />

            <Input
              rotulo="Telefone de emergência"
              value={contatoEmergenciaTelefone}
              onChange={(e) =>
                setContatoEmergenciaTelefone(
                  aplicarMascaraTelefone(e.target.value),
                )
              }
              placeholder="(71) 99999-9999"
              inputMode="tel"
            />
          </div>
        </section>

        {/* Grupo 4: Atendimento */}
        <section
          aria-labelledby="grupo-atendimento"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3 id="grupo-atendimento" className="text-xl font-bold text-malva">
            Atendimento
          </h3>

          <Input
            rotulo="Motivo da procura"
            value={motivoProcura}
            onChange={(e) => setMotivoProcura(e.target.value)}
            placeholder="Queixa ou motivo inicial do atendimento"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="campo-modalidade"
                className="block text-base font-semibold text-texto mb-1"
              >
                Modalidade
              </label>
              <select
                id="campo-modalidade"
                value={modalidade}
                onChange={(e) =>
                  setModalidade(e.target.value as "" | ModalidadeAtendimento)
                }
                className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
              >
                <option value="">Não informado</option>
                <option value="particular">Particular</option>
                <option value="convenio">Convênio</option>
              </select>
            </div>

            <Input
              rotulo="Convênio"
              value={convenioNome}
              onChange={(e) => setConvenioNome(e.target.value)}
              placeholder="Nome do plano/convênio"
            />

            <Input
              rotulo="Valor da sessão (R$)"
              value={valorSessaoReais}
              onChange={(e) => setValorSessaoReais(e.target.value)}
              placeholder="Ex.: 150,00"
              inputMode="decimal"
            />
          </div>
        </section>

        {/* Grupo 5: Observações */}
        <section
          aria-labelledby="grupo-observacoes"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3 id="grupo-observacoes" className="text-xl font-bold text-malva">
            Observações
          </h3>

          <div>
            <label
              htmlFor="campo-observacoes"
              className="block text-base font-semibold text-texto mb-1"
            >
              Observações gerais
            </label>
            <textarea
              id="campo-observacoes"
              rows={4}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Anotações administrativas ou gerais sobre o paciente"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variante="contorno"
            onClick={() => navigate(id ? `/pacientes/${id}` : "/pacientes")}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" variante="primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar paciente"}
          </Button>
        </div>
      </form>

      <Toast
        mensagem={erroGeral}
        tipo="erro"
        aoFechar={() => setErroGeral(null)}
      />
    </div>
  );
}
