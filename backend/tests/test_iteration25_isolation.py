"""Iteración 25 — Fase 2: prueba CRÍTICA de aislamiento Motor IA vs Preset.

Regla del usuario (sección 20): un preset con valores en los 13 parámetros básicos
NO puede sobrescribirlos. Tras aplicar el preset, los 13 deben ser EXACTAMENTE los
calculados por el Motor IA, y el resto del look del preset debe conservarse.

Test puro (sin API): importa las funciones de XMP de server.py.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

# Preset con valores BASURA en los 13 básicos + look no-básico (curva, HSL) que debe conservarse.
PRESET = '''<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:Version="15.0"
   crs:WhiteBalance="As Shot"
   crs:Temperature="9000"
   crs:Tint="99"
   crs:Exposure2012="+2.00"
   crs:Contrast2012="99"
   crs:Highlights2012="88"
   crs:Shadows2012="77"
   crs:Whites2012="66"
   crs:Blacks2012="55"
   crs:Texture="50"
   crs:Clarity2012="44"
   crs:Dehaze="33"
   crs:Vibrance="90"
   crs:Saturation="80"
   crs:ToneCurveName2012="Strong Contrast"
   crs:HueAdjustmentRed="20"
   crs:SplitToningHighlightHue="45">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>'''

AI = {
    "temperature": 5200, "tint": 6, "exposure": 0.35, "contrast": 5,
    "highlights": -40, "shadows": 12, "whites": 8, "blacks": -6,
    "texture": 0, "clarity": 0, "dehaze": 3, "vibrance": 8, "saturation": 0,
}

# Valor esperado (crs attr -> valor formateado por la IA) y valor basura del preset a excluir.
EXPECTED = {
    "Temperature": ("5200", "9000"),
    "Tint": ("6", "99"),
    "Exposure2012": ("+0.35", "+2.00"),
    "Contrast2012": ("5", "99"),
    "Highlights2012": ("-40", "88"),
    "Shadows2012": ("12", "77"),
    "Whites2012": ("8", "66"),
    "Blacks2012": ("-6", "55"),
    "Texture": ("0", "50"),
    "Clarity2012": ("0", "44"),
    "Dehaze": ("3", "33"),
    "Vibrance": ("8", "90"),
    "Saturation": ("0", "80"),
}


def _attr_values(xmp, attr):
    return re.findall(r'crs:' + re.escape(attr) + r'="([^"]*)"', xmp)


def test_isolation_preset_cannot_override_ai_basics():
    out = server.build_photo_xmp("IMG_1.CR3", AI, {}, PRESET, "Adobe Standard", "balanced")
    for attr, (ai_val, junk_val) in EXPECTED.items():
        vals = _attr_values(out, attr)
        assert len(vals) == 1, f"{attr} debe aparecer una sola vez, hay {vals}"
        assert vals[0] == ai_val, f"{attr}: esperado IA={ai_val}, obtenido {vals[0]}"
        assert vals[0] != junk_val, f"{attr}: el valor del preset ({junk_val}) NO debe sobrevivir"


def test_isolation_preserves_non_basic_look():
    out = server.build_photo_xmp("IMG_1.CR3", AI, {}, PRESET, "Adobe Standard", "balanced")
    assert 'crs:ToneCurveName2012="Strong Contrast"' in out
    assert 'crs:HueAdjustmentRed="20"' in out
    assert 'crs:SplitToningHighlightHue="45"' in out


def test_isolation_sets_white_balance_custom():
    out = server.build_photo_xmp("IMG_1.CR3", AI, {}, PRESET, "Adobe Standard", "balanced")
    assert _attr_values(out, "WhiteBalance") == ["Custom"]


def test_white_balance_as_shot_when_ai_leaves_wb_null():
    ai = dict(AI, temperature=None, tint=None)
    out = server.build_photo_xmp("IMG_1.CR3", ai, {}, PRESET, "Adobe Standard", "balanced")
    assert _attr_values(out, "WhiteBalance") == ["As Shot"]
    assert _attr_values(out, "Temperature") == []  # no se reintroduce el 9000 del preset


def test_fresh_xmp_without_preset_has_ai_basics():
    out = server.build_photo_xmp("IMG_2.CR3", AI, {}, None, "Adobe Standard", "balanced")
    assert 'crs:Exposure2012="+0.35"' in out
    assert 'crs:Temperature="5200"' in out
    assert 'crs:WhiteBalance="Custom"' in out
    assert 'xmp:Rating="5"' in out and 'xmp:Label="Verde"' in out


# Preset-TEMPLATE exportado de Lightroom (PresetType/ShowInPresets/UUID/Supports*/Name/Group).
# Lightroom lo trata como DEFINICIÓN de preset y NO aplica los básicos a la foto (bug DNG).
PRESET_TEMPLATE = '''<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal"
   crs:UUID="C0E10BCA4BA746118A15F586D548F6D3"
   crs:SupportsAmount="True"
   crs:SupportsColor="True"
   crs:RequiresRGBTables="False"
   crs:ShowInPresets="True"
   crs:ShowInQuickActions="False"
   crs:CameraModelRestriction=""
   crs:Version="18.0"
   crs:HasSettings="True"
   crs:Exposure2012="0.00"
   crs:Contrast2012="0"
   crs:Highlights2012="0"
   crs:Shadows2012="0"
   crs:Whites2012="0"
   crs:Blacks2012="0"
   crs:Dehaze="+9"
   crs:ToneCurveName2012="Custom"
   crs:SplitToningHighlightHue="45">
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">PREST APP WEDING</rdf:li></rdf:Alt></crs:Name>
   <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">PREST APP WEDING</rdf:li></rdf:Alt></crs:Group>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>'''


def test_preset_template_converted_to_applied_settings():
    """El bug del DNG: un preset-template debe convertirse en AJUSTES APLICADOS.
    La envoltura de preset debe desaparecer para que Lightroom aplique los básicos."""
    out = server.build_photo_xmp("KRFC2606.dng", AI, {}, PRESET_TEMPLATE, "Adobe Color", "balanced")
    # 1) La envoltura identitaria de preset NO debe sobrevivir (marcadores inequívocos de preset-template).
    for name in ("PresetType", "ShowInPresets", "ShowInQuickActions",
                 "RequiresRGBTables", "CameraModelRestriction"):
        assert not re.search(r'crs:' + name + r'[=>]', out), f"crs:{name} no debe quedar en el XMP aplicado"
    # 1b) El UUID de PRESET original ("ABC") debe desaparecer (el UUID que quede es el del Look de perfil).
    assert "ABC" not in out
    # 2) Los básicos de la IA quedan aplicados (no en 0 del preset).
    assert _attr_values(out, "Highlights2012") == ["-40"]
    assert _attr_values(out, "Blacks2012") == ["-6"]
    assert _attr_values(out, "Contrast2012") == ["5"]
    assert 'crs:HasSettings="True"' in out
    # 3) El look creativo se conserva.
    assert 'crs:ToneCurveName2012="Custom"' in out
    assert 'crs:SplitToningHighlightHue="45"' in out
    # 3b) El PERFIL SELECCIONADO (Adobe Color) se inyecta como Look resoluble por UUID.
    assert 'crs:Name="Adobe Color"' in out
    assert 'crs:UUID="B952C231111CD8E0ECCF14B86BAA7077"' in out
    assert 'crs:CameraProfile="Adobe Standard"' in out
    # 4) 5★ + verde de la selección final.
    assert 'xmp:Rating="5"' in out and 'xmp:Label="Verde"' in out
    # 5) XML bien formado.
    import xml.dom.minidom as _m
    _m.parseString(out.encode("utf-8"))


def test_selected_profile_injected_as_look_with_correct_uuid():
    """El perfil SELECCIONADO se inyecta como crs:Look resoluble por UUID (bug: salía Adobe Estándar)."""
    preset = PRESET_TEMPLATE
    for name, uuid in server.ADOBE_LOOK_UUIDS.items():
        out = server.build_photo_xmp("A.dng", AI, {}, preset, name, "balanced")
        look = re.search(r'<crs:Look>.*?</crs:Look>', out, re.DOTALL)
        assert look, f"{name}: debe inyectarse un crs:Look"
        assert f'crs:Name="{name}"' in look.group(0)
        assert f'crs:UUID="{uuid}"' in look.group(0)
        assert 'crs:Stubbed="true"' in look.group(0)
        assert 'crs:CameraProfile="Adobe Standard"' in out  # base de los Look Adobe
        import xml.dom.minidom as _m
        _m.parseString(out.encode("utf-8"))


def test_adobe_standard_profile_uses_camera_profile_not_look():
    out = server.build_photo_xmp("A.dng", AI, {}, PRESET_TEMPLATE, "Adobe Standard", "balanced")
    assert 'crs:CameraProfile="Adobe Standard"' in out
    assert "<crs:Look>" not in out


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("PASS", name)
    print("ALL ISOLATION TESTS PASSED")
