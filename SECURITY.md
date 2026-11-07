# Política de Segurança

## Nosso Modelo de Ameaça e Privacidade

O **Sistema de Pacientes e Documentos (LC Consultório)** lida com prontuários de psicologia clínica,
exigindo o mais alto nível de confidencialidade médica e privacidade.

Princípios fundamentais do design de segurança:
1. **Ambiente 100% Offline:** O software nunca abre conexões de rede ou transmite dados para servidores externos.
2. **Criptografia em Repouso:** O banco de dados SQLite é integralmente cifrado com SQLCipher. Anexos e backups
   são cifrados com XChaCha20-Poly1305.
3. **Derivação Segura:** A senha mestra e a chave física de emergência são derivadas utilizando Argon2id com
   parâmetros de alta resistência a ataques de força bruta.
4. **Proteção em Memória:** Buffers sensíveis utilizam a trait `Zeroize` para zeramento imediato após o uso.
5. **Bloqueio por Inatividade:** A aplicação tranca o acesso após 30 minutos sem interação do usuário.

## Relatando Vulnerabilidades

Se você identificar uma falha de segurança, vulnerabilidade na implementação criptográfica ou potencial
vazamento de dados:

1. **Não abra uma issue pública.**
2. Utilize o recurso nativo de **[Relatório Privado de Vulnerabilidades do GitHub](https://github.com/AndreFelipe265/LC-Pacientes/security/advisories/new)** (aba *Security* › *Advisories* › *Report a vulnerability*).
3. Caso prefira contato direto, envie os detalhes em privado ao desenvolvedor principal: **André Felipe** ([@AndreFelipe265](https://github.com/AndreFelipe265)).
4. Descreva:
   - Tipo de vulnerabilidade (ex.: IPC injection, chave residual em memória, bypass de bloqueio).
   - Passos detalhados para reproduzir o problema.
   - Impacto potencial para a privacidade da clínica.

Todas as notificações serão tratadas com prioridade máxima.
