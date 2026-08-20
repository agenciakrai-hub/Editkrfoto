#!/bin/bash
# RAW AI Studio - Instalador para Lightroom Classic (macOS)

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/rawai_studio.lrplugin"
DEST="$HOME/Library/Application Support/Adobe/Lightroom/Modules"

echo "============================================"
echo "  RAW AI Studio - Instalador de plugin"
echo "============================================"
echo ""

if [ ! -d "$SRC" ]; then
  echo "ERROR: No se encuentra la carpeta rawai_studio.lrplugin junto a este instalador."
  echo "Asegurate de descomprimir el ZIP completo antes de ejecutar."
  echo ""
  read -n 1 -s -r -p "Pulsa una tecla para salir..."
  exit 1
fi

echo "Instalando en: $DEST"
mkdir -p "$DEST"
rm -rf "$DEST/rawai_studio.lrplugin"
cp -R "$SRC" "$DEST/rawai_studio.lrplugin"

echo ""
echo "Plugin instalado correctamente."
echo "Abre (o reinicia) Lightroom Classic: RAW AI Studio se cargara automaticamente."
echo "Luego pega tu token en: RAW AI Studio > Configurar (token)."
echo ""
read -n 1 -s -r -p "Pulsa una tecla para cerrar..."
