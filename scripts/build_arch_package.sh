#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH_DIR="${ROOT_DIR}/packaging/arch"
BIN_SRC="${ROOT_DIR}/app/src-tauri/target/release/lotuspsi"
ICONS_DIR="${ROOT_DIR}/app/src-tauri/icons"

if [ ! -f "${BIN_SRC}" ]; then
    echo "Erro: Binário compilado não encontrado em ${BIN_SRC}."
    exit 1
fi

echo "==> Preparando arquivos para empacotamento Arch Linux..."
cp "${BIN_SRC}" "${ARCH_DIR}/lotuspsi"
cp "${ICONS_DIR}/32x32.png" "${ARCH_DIR}/icon-32.png"
cp "${ICONS_DIR}/128x128.png" "${ARCH_DIR}/icon-128.png"
cp "${ICONS_DIR}/128x128@2x.png" "${ARCH_DIR}/icon-256.png"
cp "${ICONS_DIR}/icon.png" "${ARCH_DIR}/icon-512.png"

cd "${ARCH_DIR}"

if command -v makepkg >/dev/null 2>&1; then
    echo "==> Executando makepkg nativo no sistema host..."
    makepkg -f --nodeps
else
    echo "==> Executando makepkg via container oficial archlinux:latest..."
    docker run --rm \
        -v "${ROOT_DIR}:/workspace" \
        -w /workspace/packaging/arch \
        archlinux:latest \
        bash -c "
            pacman -Sy --noconfirm --needed base-devel binutils zstd
            useradd -m builder
            chown -R builder:builder /workspace/packaging/arch
            su builder -c 'makepkg -f --nodeps'
            chmod -R 777 /workspace/packaging/arch
        "
fi

OUTPUT_PKG=$(ls -1 "${ARCH_DIR}"/*.pkg.tar.zst | head -n 1)
echo "==> Pacote Arch gerado com sucesso: ${OUTPUT_PKG}"

# Limpa arquivos temporários de staging
rm -f "${ARCH_DIR}/lotuspsi" "${ARCH_DIR}/icon-"*.png
rm -rf "${ARCH_DIR}/pkg" "${ARCH_DIR}/src"
